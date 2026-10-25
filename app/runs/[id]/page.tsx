import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, ShieldCheck, FileCheck2 } from "lucide-react";
import { read } from "@/lib/chain";
import type { Run, Round, Benchmark } from "@/lib/types";
import { Fingerprint } from "@/components/fingerprint";
import { ChallengeButton } from "@/components/challenge";
import { percent } from "@/lib/records";
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
          <p>
            {benchmark.name} ·{" "}
            {run.status === "published"
              ? "Published verdict"
              : run.status === "slashed"
                ? "Score challenged successfully"
                : "Assay in progress"}
          </p>
        </div>
        {run.score_bps !== null && (
          <div className="run-score">
            {percent(run.score_bps)}
            <small>%</small>
          </div>
        )}
      </div>
      <div className="record-grid">
        <div>
          <dl className="facts">
            <div>
              <dt>95% confidence interval</dt>
              <dd>
                {run.low_bps !== undefined
                  ? `${percent(run.low_bps)}% to ${percent(run.high_bps!)}%`
                  : "Awaiting verdict"}
              </dd>
            </div>
            <div>
              <dt>Challenges survived</dt>
              <dd>
                {run.survived}
                {run.survived >= 3 ? " · Tested three times or more" : ""}
              </dd>
            </div>
            <div>
              <dt>Distinct answers examined</dt>
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
                {round.method ? `. ${round.method} confidence interval.` : "."}
              </p>
              {round.challenge_successful !== undefined && (
                <p>
                  {round.challenge_successful
                    ? "The challenge found a materially lower score."
                    : "The score survived this challenge."}
                </p>
              )}
              <details>
                <summary>Read every sampled verdict</summary>
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
                          <summary>Live source snapshot</summary>
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.url}
                          </a>
                          <code>{source.text}</code>
                        </details>
                      ))}
                    </li>
                  ))}
                </ul>
              </details>
              <details>
                <summary>Inspect the sample and commitment</summary>
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
              Outputs are committed. Sampling has not started yet.
            </div>
          )}
        </div>
        <aside className="record-rail">
          <ShieldCheck size={29} />
          <h2>A claim you can examine.</h2>
          <p>
            Every round is public. Each challenge uses a fresh sample, with no
            reused questions.
          </p>
          {run.status === "published" &&
          benchmark.item_count - run.excluded.length >=
            benchmark.sample_size ? (
            <ChallengeButton id={run.id} />
          ) : (
            <p>
              {run.status === "published"
                ? "No unused sample remains."
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
          {run.status === "published" || run.status === "slashed" ? (
            <>
              <a href={`/api/badges/${id}`} className="badge-preview">
                <span>Assayed</span>
                {percent(run.score_bps!)}%
              </a>
              <p>
                Add this badge to your model card and link it to this record.
              </p>
              <code>{`[![Assayed](${process.env.APP_URL || ""}/api/badges/${id})](${process.env.APP_URL || ""}/runs/${id})`}</code>
            </>
          ) : (
            <p>Your badge appears after the assay is published.</p>
          )}
          <Link className="text-link" href="/about">
            How this verdict was reached
          </Link>
        </aside>
      </div>
    </div>
  );
}
