import type { Benchmark, Job, Run, Round } from "./types";
import { db } from "./db";
import { read, write, receipt, resumeBroadcast } from "./chain";
import { randomUUID } from "node:crypto";
import { HttpError } from "./auth";
import type { CalldataEncodable } from "genlayer-js/types";

export function samePayload(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
) {
  const stable = (value: Record<string, unknown>) =>
    JSON.stringify(
      Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]),
    );
  return stable(a) === stable(b);
}
export async function enqueue(
  owner: string,
  kind: Job["kind"],
  payload: Record<string, unknown>,
  idempotency: string | null,
) {
  if (idempotency && idempotency.length > 200)
    throw new HttpError(400, "Request key is too long");
  const sql = db();
  const id = randomUUID();
  const resultId = kind === "challenge" ? String(payload.run_id) : id;
  const rows =
    await sql`INSERT INTO jobs(id,owner_id,kind,payload,result_id,idempotency_key) VALUES(${id},${owner},${kind},${JSON.stringify(payload)},${resultId},${idempotency}) ON CONFLICT(owner_id,idempotency_key) DO NOTHING RETURNING id,result_id,state`;
  if (rows[0]) return rows[0];
  const previous =
    await sql`SELECT id,result_id,state,kind,payload FROM jobs WHERE owner_id=${owner} AND idempotency_key=${idempotency}`;
  if (
    !previous[0] ||
    previous[0].kind !== kind ||
    !samePayload(previous[0].payload, payload)
  )
    throw new HttpError(
      409,
      "This request key has already been used for different evidence",
    );
  return previous[0];
}
export async function indexRecord(kind: "benchmark" | "run", id: string) {
  const record =
    kind === "benchmark"
      ? await read<Benchmark>("registry", "get_benchmark", [id])
      : await read<Run>("office", "get_run", [id]);
  await db()`INSERT INTO public_records(id,kind,record) VALUES(${id},${kind},${JSON.stringify(record)}) ON CONFLICT(id) DO UPDATE SET record=excluded.record,updated_at=now()`;
  return record;
}
export async function syncRecords() {
  const count = await read<number>("registry", "count");
  for (let offset = 0; offset < count; offset += 100) {
    for (const record of await read<Benchmark[]>(
      "registry",
      "list_benchmarks",
      [offset, 100],
    ))
      await db()`INSERT INTO public_records(id,kind,record) VALUES(${record.id},'benchmark',${JSON.stringify(record)}) ON CONFLICT(id) DO UPDATE SET record=excluded.record,updated_at=now()`;
  }
  const config = await read<{ run_count: number }>("office", "configuration");
  for (let offset = 0; offset < config.run_count; offset += 100) {
    for (const record of await read<Run[]>("office", "list_runs", [
      offset,
      100,
    ]))
      await db()`INSERT INTO public_records(id,kind,record) VALUES(${record.id},'run',${JSON.stringify(record)}) ON CONFLICT(id) DO UPDATE SET record=excluded.record,updated_at=now()`;
  }
}
async function advanceNext() {
  const sql = db();
  const token = randomUUID();
  const rows =
    await sql`UPDATE jobs SET lease_token=${token},lease_until=now()+interval '90 seconds',state='working' WHERE id=(SELECT id FROM jobs WHERE state IN ('queued','working') AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
  const job = rows[0] as Job | undefined;
  if (!job) return false;
  const update = async (
    state: string,
    step: number,
    hash: string | null,
    error: string | null = null,
  ) => {
    await sql`UPDATE jobs SET state=${state},step=${step},tx_hash=${hash},error=${error},lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
  };
  try {
    const broadcast = job as Job & {
      signed_tx: string | null;
      broadcast_hash: string | null;
    };
    if (!job.tx_hash && broadcast.signed_tx && broadcast.broadcast_hash) {
      const hash = await resumeBroadcast(
        broadcast.signed_tx,
        broadcast.broadcast_hash,
      );
      await update("working", job.step, hash);
      return true;
    }
    if (job.tx_hash) {
      const tx = await receipt(job.tx_hash);
      if (!tx) {
        await update("working", job.step, job.tx_hash);
        return true;
      }
      await sql`UPDATE jobs SET transactions=transactions||${JSON.stringify([job.tx_hash])}::jsonb,state='queued',step=step+1,tx_hash=NULL,signed_tx=NULL,broadcast_hash=NULL,lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
      return true;
    }
    const p = job.payload;
    let operation: {
      which: "registry" | "vault" | "office";
      method: string;
      args: CalldataEncodable[];
    } | null = null;
    if (job.kind === "publish") {
      if (job.step === 0)
        operation = {
          which: "registry",
          method: "publish",
          args: [
            job.result_id,
            p.name,
            p.dataset_url,
            p.content_hash,
            p.rubric,
            p.sample_size,
            p.scale,
            p.tolerance_bps,
            p.overlap_bps,
          ] as CalldataEncodable[],
        };
      else {
        await indexRecord("benchmark", job.result_id);
        await update("complete", job.step, null);
        return true;
      }
    } else {
      if (job.step === 0) {
        const config = await read<{ minimum: number }>(
          "vault",
          "configuration",
        );
        operation = {
          which: "vault",
          method: "lock",
          args: [job.id, job.owner_id, config.minimum],
        };
      } else if (job.step === 1) {
        operation =
          job.kind === "submit"
            ? {
                which: "office",
                method: "submit_run",
                args: [
                  job.result_id,
                  p.benchmark_id,
                  p.outputs_url,
                  p.outputs_hash,
                  p.model,
                  job.owner_id,
                ] as CalldataEncodable[],
              }
            : {
                which: "office",
                method: "challenge",
                args: [job.result_id, job.id, job.owner_id],
              };
      } else if (job.step === 2) {
        operation = {
          which: "office",
          method: "start_round",
          args: [job.result_id, job.transactions[1]],
        };
      } else {
        const run = await read<Run>("office", "get_run", [job.result_id]);
        const round = await read<Round>("office", "get_round", [
          job.result_id,
          run.round_count - 1,
        ]);
        if (round.status === "published") {
          if (round.challenge_id) {
            const lock = await read<{ settled: boolean }>("vault", "get_lock", [
              round.challenge_id,
            ]);
            if (!lock.settled) {
              await update("working", job.step, null);
              return true;
            }
          }
          await indexRecord("run", job.result_id);
          await update("complete", job.step, null);
          return true;
        }
        operation =
          round.grades.length < round.sample.length
            ? {
                which: "office",
                method: "grade_item",
                args: [job.result_id, round.grades.length],
              }
            : { which: "office", method: "finalize", args: [job.result_id] };
      }
    }
    const hash = await write(
      operation.which,
      operation.method,
      operation.args,
      0n,
      async (raw, hash) => {
        const saved =
          await sql`UPDATE jobs SET signed_tx=${raw},broadcast_hash=${hash},updated_at=now() WHERE id=${job.id} AND lease_token=${token} RETURNING id`;
        if (!saved[0]) throw new Error("Worker lease expired before broadcast");
      },
    );
    await update("working", job.step, hash);
  } catch {
    // Never persist SDK errors: some clients embed request headers and credentials.
    await sql`UPDATE jobs SET state='failed',attempts=attempts+1,error='The network could not complete this step. Your progress is saved.',lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
  }
  return true;
}

export async function processNext() {
  const sql = db();
  const token = randomUUID();
  const lock =
    await sql`INSERT INTO worker_locks(name,token,expires_at) VALUES('studio_signer',${token},now()+interval '180 seconds') ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE worker_locks.expires_at<now() RETURNING token`;
  if (!lock[0]) return false;
  try {
    return await advanceNext();
  } finally {
    await sql`DELETE FROM worker_locks WHERE name='studio_signer' AND token=${token}`;
  }
}
