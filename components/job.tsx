"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useState, useEffect } from "react";
import Link from "next/link";
import { LoaderCircle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
type Progress = {
  id: string;
  kind: string;
  state: string;
  step: number;
  transactions: string[];
  result_id: string;
  error: string | null;
};
export function JobProgress({ id }: { id: string }) {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <EmailProgress id={id} />
  ) : (
    <p className="notice">Email sign in is awaiting configuration.</p>
  );
}
function EmailProgress({ id }: { id: string }) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const [job, setJob] = useState<Progress | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    async function poll() {
      try {
        const token = await getAccessToken();
        const response = await fetch(`/api/jobs/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (active) {
          setJob(data);
          setError("");
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Could not check the assay",
          );
      }
    }
    poll();
    const timer = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, authenticated, getAccessToken]);
  async function retry() {
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/jobs/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Retry could not start");
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again");
    }
  }
  if (!authenticated)
    return (
      <button className="button primary" onClick={login}>
        Sign in to follow your assay
      </button>
    );
  return (
    <div className="job-panel">
      {job?.state === "complete" ? (
        <CheckCircle2 size={35} />
      ) : job?.state === "cancelled" ? (
        <XCircle size={35} />
      ) : (
        <LoaderCircle className="spin" size={32} />
      )}
      <h2>
        {job?.state === "complete"
          ? "The record is ready."
          : job?.state === "cancelled"
            ? "The assessment closed without a verdict."
          : job?.state === "failed"
            ? "A pause, with your progress saved."
            : "The assay is underway."}
      </h2>
      <p>
        {job
          ? `Status: ${job.state}. ${job.transactions.length} finalized transactions.`
          : "Checking your saved progress."}
      </p>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {job?.error && <p>{job.error}</p>}
      {job?.state === "failed" && (
        <button className="button secondary" onClick={retry}>
          <RefreshCw size={16} />
          Retry this step
        </button>
      )}
      {job && ["complete", "cancelled"].includes(job.state) && (
        <Link
          className="button primary"
          href={
            job.kind === "publish" ? "/benchmarks" : `/runs/${job.result_id}`
          }
        >
          Open the public record
        </Link>
      )}
      {Boolean(job?.transactions.length) && (
        <details>
          <summary>Finalized transaction receipts</summary>
          <ol>
            {job?.transactions.map((hash) => (
              <li key={hash}>
                <a
                  href={`https://studio.genlayer.com/transactions/${hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {hash}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="field-help">
        You can close this page. The worker keeps going and this link remembers
        where you left off.
      </p>
    </div>
  );
}
