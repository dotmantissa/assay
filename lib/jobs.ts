import type { Benchmark, Job, Run, Round } from "./types";
import { db } from "./db";
import { read, write, receipt, resumeBroadcast, TerminalTransactionError } from "./chain";
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
  const resultId = (kind === "challenge" || kind === "maintain") ? String(payload.run_id || payload.lock_id) : id;
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
  const record = kind === "benchmark"
    ? await read<Benchmark>("registry", "get_benchmark", [id])
    : await read<Run>("office", "get_run", [id]);
  const finalized = { ...record, finality: "finalized" };
  await db()`INSERT INTO public_records(id,kind,record) VALUES(${id},${kind},${JSON.stringify(finalized)}) ON CONFLICT(kind,id) DO UPDATE SET record=excluded.record,updated_at=now()`;
  return finalized;
}

export async function syncRecords() {
  // Collect the entire successful finalized snapshot before replacing the index.
  const benchmarks: Benchmark[] = [], runs: Run[] = [];
  const count = await read<number>("registry", "count");
  for (let offset = 0; offset < count; offset += 100)
    benchmarks.push(...await read<Benchmark[]>("registry", "list_benchmarks", [offset, 100]));
  const config = await read<{ run_count: number }>("office", "configuration");
  for (let offset = 0; offset < config.run_count; offset += 100)
    runs.push(...await read<Run[]>("office", "list_runs", [offset, 100]));
  const sql = db();
  const snapshot = [...benchmarks.map((record) => ({ kind: "benchmark", record })),
                    ...runs.map((record) => ({ kind: "run", record }))];
  await sql.transaction([
    sql`DELETE FROM public_records`,
    ...snapshot.map(({kind, record}) => sql`INSERT INTO public_records(id,kind,record) VALUES(${record.id},${kind},${JSON.stringify({...record, finality: "finalized"})})`),
  ]);
  await sql`INSERT INTO accounts(id,privy_id) VALUES('__maintenance__','internal:maintenance') ON CONFLICT DO NOTHING`;
  for (const run of runs) {
    if (run.pending_operation || (run.status === "published" && Date.now()/1000 >= run.challenge_until) ||
        (["committed","challenged","grading"].includes(run.status) && Date.now()/1000 >= run.deadline))
      await enqueue("__maintenance__", "maintain", {run_id: run.id}, `maintain:${run.id}:${run.pending_operation || "close"}`);
  }
  const failed = await sql`SELECT id FROM jobs WHERE kind IN ('submit','challenge') AND state='failed' AND created_at<now()-interval '24 hours'`;
  for (const job of failed) {
    if (!await read<boolean>("vault", "lock_exists", [job.id])) continue;
    const bond = await read<{expires_at: number}>("vault", "get_lock", [job.id]);
    if (Date.now()/1000 >= bond.expires_at && !Object.keys(await read<Record<string, unknown>>("office", "get_bond_use", [job.id])).length)
      await enqueue("__maintenance__", "maintain", {lock_id: job.id}, `expire:${job.id}`);
  }
  // Maintenance is public protocol recovery and must resume automatically after an RPC outage.
  await sql`UPDATE jobs SET state='queued',error=NULL,failure_kind=NULL,lease_until=NULL,next_poll_at=now(),tx_started_at=CASE WHEN tx_hash IS NULL AND signed_tx IS NULL THEN NULL ELSE now() END WHERE kind='maintain' AND state='failed' AND updated_at<now()-interval '5 minutes'`;

}

export function pollingDelay(polls: number) {
  return Math.min(120, 8 * 2 ** Math.min(polls, 4));
}
export function waitingExpired(started: string | null, current = Date.now()) {
  return !!started && current - Date.parse(started) >= 86_400_000;
}

async function advanceNext() {
  const sql = db(), token = randomUUID();
  const rows = await sql`UPDATE jobs SET lease_token=${token},lease_until=now()+interval '90 seconds',state='working' WHERE id=(SELECT id FROM jobs WHERE state IN ('queued','working') AND next_poll_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_poll_at,updated_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`;
  const job = rows[0] as Job | undefined;
  if (!job) return false;
  const update = async (state: string, step: number, hash: string | null, wait = false) => {
    const delay = wait ? pollingDelay(job.poll_count) : 0;
    await sql`UPDATE jobs SET state=${state},step=${step},tx_hash=${hash},lease_until=NULL,lease_token=NULL,next_poll_at=now()+${delay}*interval '1 second',poll_count=${wait ? job.poll_count + 1 : 0},updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
  };
  const next = async () => {
    await sql`UPDATE jobs SET state='queued',step=step+1,tx_hash=NULL,signed_tx=NULL,broadcast_hash=NULL,tx_started_at=NULL,poll_count=0,next_poll_at=now(),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
  };
  try {
    if (waitingExpired(job.tx_started_at))
      throw new Error("Waiting deadline exceeded");
    if (!job.tx_hash && job.signed_tx && job.broadcast_hash) {
      await update("working", job.step, await resumeBroadcast(job.signed_tx, job.broadcast_hash), true);
      return true;
    }
    if (job.tx_hash) {
      await sql`UPDATE jobs SET tx_started_at=COALESCE(tx_started_at,now()) WHERE id=${job.id} AND lease_token=${token}`;
      const tx = await receipt(job.tx_hash);
      if (!tx) {
        await update("working", job.step, job.tx_hash, true);
        return true;
      }
      await sql`UPDATE jobs SET commitment_tx=CASE WHEN ${job.step} = 1 AND kind IN ('submit','challenge') THEN ${job.tx_hash} ELSE commitment_tx END,transactions=transactions||${JSON.stringify([job.tx_hash])}::jsonb,state='queued',step=step+1,tx_hash=NULL,signed_tx=NULL,broadcast_hash=NULL,tx_started_at=NULL,poll_count=0,next_poll_at=now(),lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
      return true;
    }
    const p = job.payload;
    let operation: {which: "registry" | "vault" | "office"; method: string; args: CalldataEncodable[]} | null = null;
    if (job.kind === "publish") {
      if (await read<boolean>("registry", "benchmark_exists", [job.result_id])) {
        const record = await indexRecord("benchmark", job.result_id);
        if (!("content_hash" in record) || record.content_hash !== p.content_hash) throw new Error("Existing benchmark differs");
        await update("complete", job.step, null);
        return true;
      }
      operation = {which: "registry", method: "publish", args: [job.result_id, p.name, p.dataset_url, p.content_hash, p.rubric, p.sample_size, p.scale, p.tolerance_bps, p.overlap_bps] as CalldataEncodable[]};
    } else if (job.kind === "maintain") {
      if (p.lock_id) {
        const operationId = "unused:" + String(p.lock_id);
        const use = await read<{refunded?: boolean}>("office", "get_bond_use", [String(p.lock_id)]);
        if (!use.refunded) {
          if (Object.keys(use).length) { await update("complete", job.step, null); return true; }
          operation = {which: "office", method: "expire_unused", args: [String(p.lock_id)]};
        } else {
          const applied = await read<Record<string, unknown>>("vault", "get_operation", [operationId]);
          if (applied.id) { await update("complete", job.step, null); return true; }
          operation = {which: "office", method: "retry_settlement", args: [operationId]};
        }
      } else {
      const run = await read<Run>("office", "get_run", [String(p.run_id)]);
      if (run.pending_operation) {
        const applied = await read<Record<string, unknown>>("vault", "get_operation", [run.pending_operation]);
        operation = {which: "office", method: applied.id ? "reconcile_settlement" : "retry_settlement", args: [run.pending_operation]};
      } else if ((run.status === "published" && Date.now()/1000 >= run.challenge_until) ||
                 (["committed","challenged","grading"].includes(run.status) && Date.now()/1000 >= run.deadline)) {
        operation = {which: "office", method: "close_run", args: [run.id]};
      } else {
        await indexRecord("run", run.id);
        await update("complete", job.step, null);
        return true;
      }
      }
    } else if (job.step === 0) {
      if (await read<boolean>("vault", "lock_exists", [job.id])) {
        const lock = await read<{run_id: string; owner: string; role: string; round: number}>("vault", "get_lock", [job.id]);
        if (lock.run_id !== job.result_id || lock.owner !== job.owner_id || lock.role !== (job.kind === "submit" ? "run" : "challenge") || lock.round !== (job.kind === "submit" ? 0 : Number(p.round_number)))
          throw new Error("Existing bond differs");
        await next();
        return true;
      }
      const config = await read<{minimum: number}>("vault", "configuration");
      operation = {which: "vault", method: "lock", args: [job.id, job.owner_id, config.minimum, job.result_id,
        job.kind === "submit" ? 0 : Number(p.round_number), job.kind === "submit" ? "run" : "challenge"]};
    } else if (job.step === 1) {
      const applied = job.kind === "submit" ? await read<boolean>("office", "run_exists", [job.result_id])
        : !!(await read<{run_id?: string}>("office", "get_bond_use", [job.id])).run_id;
      if (applied) {
        // A receipt is needed to start the exact commitment; never invent a replacement hash.
        if (!(job.commitment_tx || job.transactions[1])) throw new Error("Commitment receipt needs recovery");
        await next();
        return true;
      }
      operation = job.kind === "submit"
        ? {which: "office", method: "submit_run", args: [job.result_id, p.benchmark_id, p.outputs_url, p.outputs_hash, p.model, job.owner_id] as CalldataEncodable[]}
        : {which: "office", method: "challenge", args: [job.result_id, job.id, job.owner_id]};
    } else {
      const run = await read<Run>("office", "get_run", [job.result_id]);
      if (run.pending_operation) {
        const applied = await read<Record<string, unknown>>("vault", "get_operation", [run.pending_operation]);
        operation = {which: "office", method: applied.id ? "reconcile_settlement" : "retry_settlement", args: [run.pending_operation]};
      } else if (["cancelled","inconclusive"].includes(run.status)) {
        await indexRecord("run", run.id);
        await update("cancelled", job.step, null);
        return true;
      } else if (["committed","challenged","grading"].includes(run.status) && Date.now()/1000 >= run.deadline) {
        operation = {which: "office", method: "close_run", args: [run.id]};
      } else {
        const number = job.kind === "submit" ? 0 : Number(p.round_number);
        if (run.round_count <= number) {
          operation = {which: "office", method: "start_round", args: [run.id, job.commitment_tx || job.transactions[1]]};
        } else {
          const round = await read<Round>("office", "get_round", [run.id, number]);
          if (round.status === "published") {
            await indexRecord("run", run.id);
            await update("complete", job.step, null);
            return true;
          }
          operation = round.grades.length < round.sample.length
            ? {which: "office", method: "grade_item", args: [run.id, round.grades.length]}
            : {which: "office", method: "finalize", args: [run.id]};
        }
      }
    }
    const hash = await write(operation.which, operation.method, operation.args, 0n, async (raw, hash) => {
      const saved = await sql`UPDATE jobs SET signed_tx=${raw},broadcast_hash=${hash},tx_started_at=COALESCE(tx_started_at,now()),updated_at=now() WHERE id=${job.id} AND lease_token=${token} RETURNING id`;
      if (!saved[0]) throw new Error("Worker lease expired before broadcast");
    });
    await update("working", job.step, hash, true);
  } catch (error) {
    // Terminal execution is safe to sign again after state reconciliation. Unknown/pending broadcasts stay intact.
    const terminal = error instanceof TerminalTransactionError;
    const kind = terminal ? "execution" : waitingExpired(job.tx_started_at) ? "deadline" : "transport";
    if (terminal)
      await sql`UPDATE jobs SET failed_transactions=failed_transactions||${JSON.stringify([job.tx_hash || job.broadcast_hash])}::jsonb,tx_hash=NULL,signed_tx=NULL,broadcast_hash=NULL,tx_started_at=NULL WHERE id=${job.id} AND lease_token=${token}`;
    await sql`UPDATE jobs SET state='failed',attempts=attempts+1,failure_kind=${kind},error=${terminal ? "This transaction was rejected. Retry will reconcile chain state and sign a new transaction." : "This step is waiting for network recovery. Its saved broadcast will be checked before any new transaction."},lease_until=NULL,lease_token=NULL,updated_at=now() WHERE id=${job.id} AND lease_token=${token}`;
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
