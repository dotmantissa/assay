import Link from "next/link";
import { Plus, BookOpen, ExternalLink, LockKeyhole } from "lucide-react";
import { records } from "@/lib/records";
export const dynamic = "force-dynamic";
export default async function Benchmarks() {
  const data = await records();
  return (
    <div className="page-body">
      <div className="page-heading">
        <div>
          <h1>A fair test starts here.</h1>
          <p>Public questions. A clear rubric. A dataset that stays put.</p>
        </div>
        <Link className="button primary" href="/benchmarks/publish">
          <Plus size={18} /> Publish a benchmark
        </Link>
      </div>
      {!data.available && (
        <p className="notice">
          The benchmark index is temporarily unavailable.
        </p>
      )}
      {data.benchmarks.length ? (
        <div className="benchmark-list">
          {data.benchmarks.map((b) => (
            <article className="benchmark" key={b.id}>
              <div className="benchmark-head">
                <BookOpen size={24} />
                <h2>{b.name}</h2>
                <span>
                  {b.scale === 1
                    ? "Binary correctness"
                    : `${b.scale} point scale`}
                </span>
              </div>
              <p>{b.rubric}</p>
              <dl className="facts">
                <div>
                  <dt>Dataset</dt>
                  <dd>{b.item_count} questions</dd>
                </div>
                <div>
                  <dt>Full coverage</dt>
                  <dd>{b.item_count} answers per round</dd>
                </div>
                <div>
                  <dt>Error overlap</dt>
                  <dd>{b.overlap_bps / 100}% minimum</dd>
                </div>
                <div>
                  <dt>Score tolerance</dt>
                  <dd>{b.tolerance_bps / 100}%</dd>
                </div>
              </dl>
              <details>
                <summary>
                  <LockKeyhole size={16} /> Locked evidence and sampling
                </summary>
                <code>{b.content_hash}</code>
                <p>{b.sampling_rule}</p>
                <a href={b.dataset_url} target="_blank" rel="noreferrer">
                  Open the dataset <ExternalLink size={14} />
                </a>
              </details>
              <Link
                className="button secondary"
                href={`/submit?benchmark=${encodeURIComponent(b.id)}`}
              >
                Assay against this benchmark
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className="large-empty">
          <BookOpen size={45} strokeWidth={1.2} />
          <h2>Someone has to set the exam.</h2>
          <p>
            Publish a dataset and a rubric. The registry locks their identity so
            future scores have a stable reference.
          </p>
          <Link className="button secondary" href="/benchmarks/publish">
            Create the first benchmark
          </Link>
        </div>
      )}
    </div>
  );
}
