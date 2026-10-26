import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, ShieldCheck, FileCheck2 } from "lucide-react";
import { read } from "@/lib/chain";
import type { Run, Round, Benchmark } from "@/lib/types";
import { Fingerprint } from "@/components/fingerprint";
import { ChallengeButton } from "@/components/challenge";
import { percent } from "@/lib/records";
const challengeOpen = (run: Run) => Date.now() / 1000 < run.challenge_until;
export const dynamic = "force-dynamic";
export default async function RunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let run: Run;
  let benchmark: Benchmark;
  let rounds: Round[];
  try {
    run = await read<Run>("office", "get_run", [id]);
    benchmark = await read<Benchmark>("registry", "get_benchmark", [
      run.benchmark_id,
    ]);
    rounds = [];
    for (let i = 0; i < run.round_count; i++)
      rounds.push(await read<Round>("office", "get_round", [id, i]));
  } catch {
    notFound();
  }
  return (
    <div className="page-body">
      <div className="page-heading run-header">
        <div>
          <h1>{run.model}</h1>
          <p>Submitter supplied label · model attribution unverified</p>
          <p>
            {benchmark.name} ·{" "}
            {["published", "completed"].includes(run.status)
              ? "Finalized artifact verdict"
              : run.status === "slashed"
                ? "Score challenged successfully"
                : "Assay in progress"}
          </p>
        </div>
        {run.score_bps !== null && (
          <div className="run-score">
            {!["published", "completed", "slashed"].includes(run.status) && <small>Previous result · under review</small>}
            {percent(run.score_bps)}
            <small>%</small>
          </div>
        )}
      </div>
      <div className="record-grid">
        <div>
          <dl className="facts">
            <div>
              <dt>Evidence scope · finality</dt>
              <dd>
                Complete committed dataset · finalized chain state. This is an artifact grade, with no claim of population confidence or model provenance.
              </dd>
            </div>
            <div>
              <dt>Completed regrades</dt>
              <dd>
                {run.survived}
                · Account independence unverified
              </dd>
            </div>
            <div>
              <dt>Committed dataset items</dt>
              <dd>{run.excluded.length}</dd>
            </div>
          </dl>
          {rounds.map((round) => (
            <article className="round" key={round.number}>
              <div className="round-heading">
                <h2>
                  {round.number === 0
                    ? "Original assay"
                    : `Challenge round ${round.number}`}
                </h2>
                <span>
                  {round.score_bps !== undefined
                    ? `${percent(round.score_bps)}%`
                    : "Grading in progress"}
                </span>
              </div>
              <Fingerprint grades={round.grades} />
              <p className="field-help">
                {round.grades.length} of {round.sample.length} answers examined
                {round.method ? `. ${round.method}.` : "."}
              </p>
              {round.challenge_successful !== undefined && (
                <p>
                  {round.settlement !== "confirmed" ? "Settlement is pending; the proposed result is not effective." : round.challenge_successful
                    ? "The challenge found a materially lower score."
                    : "No material drop exceeded the tolerance. This does not establish independent scrutiny."}
                </p>
              )}
              <details>
                <summary>Read every item verdict</summary>
                <ul className="grade-list">
                  {round.grades.map((g) => (
                    <li key={g.id}>
                      <strong>
                        Item {g.id} · {g.score} of {benchmark.scale} points ·{" "}
                        {g.incorrect ? "Incorrect" : "Correct"}
                      </strong>
                      <p>{g.reason}</p>
                      {g.sources?.map((source) => (
                        <details key={source.url}>
                          <summary>Committed source snapshot</summary>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.url}
                          </a>
                          <p>Publisher declared as of: {source.as_of}</p><code>{source.sha256}</code><code>{source.text}</code>
                        </details>
                      ))}
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Inspect dataset coverage and commitment</summary>
                <p className="field-help">
                  Dataset positions: {round.sample.join(", ")}
                </p>
                <code>{round.seed}</code>
                <a
                  href={`https://studio.genlayer.com/transactions/${round.commitment_tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Commitment transaction <ExternalLink size={14} />
                </a>
              </details>
            </article>
          ))}
          {!rounds.length && (
            <div className="notice">
              Outputs are committed. Grading has not started yet.
            </div>
          )}
        </div>
        <aside className="record-rail">
          <ShieldCheck size={29} />
          <h2>A claim you can examine.</h2>
          <p>
            Every round regrades the entire committed dataset against the same source snapshots. The headline retains the lowest verified score for each item across completed rounds.
          </p>
          {run.status === "published" &&
          challengeOpen(run) ? (
            <ChallengeButton id={run.id} />
          ) : (
            <p>
              {run.status === "published"
                ? "The seven day challenge window has closed."
                : "Challenges open after a verdict is published."}
            </p>
          )}
          <p className="fine-print">
            Studio bonds are disabled. This score has no financial backing.
          </p>
          <details>
            <summary>
              <FileCheck2 size={15} />
              Committed outputs
            </summary>
            <a href={run.outputs_url} target="_blank" rel="noreferrer">
              View the submitted answers
            </a>
            <code>{run.outputs_hash}</code>
          </details>
          <h2>Carry the proof with you.</h2>
          {["published", "completed", "slashed"].includes(run.status) ? (
            <>
              <a href={`/api/badges/${id}`} className="badge-preview">
                <span>Artifact grade · {benchmark.name} · {run.n} items</span>
                {percent(run.score_bps!)}%
              </a>
              <p>
                This badge identifies the benchmark and coverage. It certifies submitted answers; the named model and execution settings are unverified.
              </p>
              <code>{`[![Artifact grade](${process.env.APP_URL || ""}/api/badges/${id})](${process.env.APP_URL || ""}/runs/${id})`}</code>
            </>
          ) : (
            <p>Your badge appears after the assay is published.</p>
          )}
          <Link className="text-link" href="/about">
            How this verdict was reached
          </Link>
          <p className="field-help">Run status: {run.status}. Challenge window closes {run.challenge_until ? new Date(run.challenge_until*1000).toISOString() : "after publication"}. Unfinished rounds expire after one day and become inconclusive.</p>
        </aside>
      </div>
    </div>
  );
}
