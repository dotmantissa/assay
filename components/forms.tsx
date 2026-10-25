"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, Upload, CheckCircle2, Info } from "lucide-react";
import type { Benchmark } from "@/lib/types";
export function EvidenceForm({
  kind,
  benchmarks = [],
  selected = "",
}: {
  kind: "publish" | "submit";
  benchmarks?: Benchmark[];
  selected?: string;
}) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID)
    return <p className="notice">Email sign in is awaiting configuration.</p>;
  return (
    <AuthenticatedForm
      kind={kind}
      benchmarks={benchmarks}
      selected={selected}
    />
  );
}
function AuthenticatedForm({
  kind,
  benchmarks,
  selected,
}: {
  kind: "publish" | "submit";
  benchmarks: Benchmark[];
  selected: string;
}) {
  const { authenticated, ready, login, getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [job, setJob] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [mode, setMode] = useState("url");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authenticated) {
      login();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      const form = new FormData(event.currentTarget);
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      let url = String(form.get("evidence_url") || ""),
        hash = String(form.get("evidence_hash") || "");
      if (mode === "file") {
        if (!file) throw new Error("Choose a JSON file first");
        if (file.size > 2_000_000) throw new Error("Keep the file below 2 MB");
        const document = JSON.parse(await file.text());
        const response = await fetch("/api/evidence", {
          method: "POST",
          headers,
          body: JSON.stringify({
            kind: kind === "publish" ? "dataset" : "outputs",
            document,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        url = result.url;
        hash = result.hash;
      }
      const payload =
        kind === "publish"
          ? {
              name: form.get("name"),
              dataset_url: url,
              content_hash: hash,
              rubric: form.get("rubric"),
              sample_size: Number(form.get("sample_size")),
              scale: Number(form.get("scale")),
              tolerance_bps: Math.round(Number(form.get("tolerance")) * 100),
              overlap_bps: Math.round(Number(form.get("overlap")) * 100),
            }
          : {
              benchmark_id: form.get("benchmark_id"),
              model: form.get("model"),
              outputs_url: url,
              outputs_hash: hash,
            };
      const response = await fetch(
        kind === "publish" ? "/api/benchmarks" : "/api/submissions",
        {
          method: "POST",
          headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setJob(result.id);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong. Try again",
      );
    } finally {
      setBusy(false);
    }
  }
  if (job)
    return (
      <div className="success-state">
        <CheckCircle2 size={42} />
        <h2>It’s in the examiners’ hands.</h2>
        <p>
          Your evidence is queued. You can follow every transaction as it
          happens.
        </p>
        <Link className="button primary" href={`/jobs/${job}`}>
          Follow the assay
        </Link>
      </div>
    );
  return (
    <form className="evidence-form" onSubmit={submit}>
      {kind === "submit" ? (
        <>
          <label>
            Model or agent name
            <input
              name="model"
              required
              maxLength={120}
              placeholder="The name people will recognise"
            />
          </label>
          <label>
            Benchmark
            <select name="benchmark_id" required defaultValue={selected}>
              <option value="">Choose a published benchmark</option>
              {benchmarks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {!benchmarks.length && (
            <div className="notice">
              <Info size={18} />
              <span>
                A benchmark needs to be published first.{" "}
                <Link href="/benchmarks/publish">Set one up</Link>.
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <label>
            Benchmark name
            <input
              name="name"
              required
              maxLength={120}
              placeholder="Give the test a memorable name"
            />
          </label>
          <label>
            Public grading rubric
            <textarea
              name="rubric"
              required
              minLength={20}
              maxLength={12000}
              rows={6}
              placeholder="Explain what makes an answer correct, what loses points, and what counts as a material error."
            />
          </label>
          <div className="form-grid">
            <label>
              Answers per sample
              <input
                name="sample_size"
                type="number"
                min={1}
                max={100}
                defaultValue={20}
                required
              />
            </label>
            <label>
              Maximum points per answer
              <input
                name="scale"
                type="number"
                min={1}
                max={100}
                defaultValue={1}
                required
              />
            </label>
            <label>
              Score tolerance (%)
              <input
                name="tolerance"
                type="number"
                min={0}
                max={10}
                step={0.01}
                defaultValue={0}
                required
              />
            </label>
            <label>
              Minimum error overlap (%)
              <input
                name="overlap"
                type="number"
                min={50}
                max={100}
                step={0.01}
                defaultValue={100}
                required
              />
            </label>
          </div>
        </>
      )}
      <fieldset>
        <legend>
          {kind === "publish" ? "Dataset evidence" : "Submitted answers"}
        </legend>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={mode === "url"}
            onClick={() => setMode("url")}
          >
            Public URL
          </button>
          <button
            type="button"
            aria-pressed={mode === "file"}
            onClick={() => setMode("file")}
          >
            Upload JSON
          </button>
        </div>
        {mode === "url" ? (
          <>
            <label>
              Public HTTPS URL
              <input
                name="evidence_url"
                type="url"
                pattern="https://.*"
                required
                placeholder="https://"
              />
            </label>
            <label>
              SHA256 of the exact document bytes
              <input
                name="evidence_hash"
                pattern="[a-f0-9]{64}"
                minLength={64}
                maxLength={64}
                required
                spellCheck={false}
                placeholder="64 lowercase hexadecimal characters"
              />
            </label>
          </>
        ) : (
          <label className="file-field">
            <Upload size={24} />
            <span>{file ? file.name : "Choose a JSON file"}</span>
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
            />
          </label>
        )}
        <p className="field-help">
          {kind === "publish"
            ? "A JSON object with an items array. Each item needs a unique id and a question. Add reference answers or up to three live HTTPS sources when useful."
            : "A JSON object with an outputs map. Each dataset item id maps to the model’s full answer as a string."}
        </p>
        <p className="field-help">
          Published evidence is public and cannot be edited. Leave private data
          out of your answers.
        </p>
      </fieldset>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={!ready || busy || (kind === "submit" && !benchmarks.length)}
      >
        {busy ? (
          <LoaderCircle className="spin" size={18} />
        ) : (
          <Upload size={18} />
        )}{" "}
        {busy
          ? "Checking the evidence"
          : authenticated
            ? kind === "publish"
              ? "Publish benchmark"
              : "Commit answers and begin"
            : "Sign in with email to continue"}
      </button>
      <p className="field-help">
        Studio transactions are sponsored. Native bonds are disabled here.
      </p>
    </form>
  );
}
