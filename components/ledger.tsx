"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  FlaskConical,
  Plus,
  ShieldCheck,
} from "lucide-react";
import type { Benchmark, Run } from "@/lib/types";
export function Ledger({
  runs,
  benchmarks,
}: {
  runs: Run[];
  benchmarks: Benchmark[];
}) {
  const [query, setQuery] = useState(""),
    [benchmark, setBenchmark] = useState(""),
    [sort, setSort] = useState("name");
  const visible = useMemo(
    () =>
      runs
        .filter(
          (r) =>
            ["published", "completed", "slashed"].includes(r.status) && r.finality === "finalized" &&
            (!benchmark || r.benchmark_id === benchmark) &&
            r.model.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) => benchmark && sort === "score"
          ? (b.score_bps || 0) - (a.score_bps || 0)
          : a.benchmark_id.localeCompare(b.benchmark_id) || a.model.localeCompare(b.model)),
    [runs, query, benchmark, sort],
  );
  return (
    <section className="ledger">
      <div className="ledger-heading">
        <h2>The public ledger</h2>
        <span>
          {visible.length}{" "}
          {visible.length === 1 ? "finalized artifact" : "finalized artifacts"}
        </span>
      </div>
      <div className="ledger-toolbar">
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Search submitter labels"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a submitter label"
          />
        </label>
        <label className="select-field">
          <SlidersHorizontal size={16} />
          <select
            aria-label="Filter benchmark"
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
          >
            <option value="">Browse benchmarks (unranked)</option>
            {benchmarks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <select
          aria-label="Sort runs"
          disabled={!benchmark}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Alphabetical</option>
          <option value="score">Score within this benchmark</option>
        </select>
      </div>
      {visible.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Unverified model label</th>
                <th>Benchmark</th>
                <th>Score</th>
                <th>Coverage · status</th>
                <th>Completed regrades</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/runs/${r.id}`}>{r.model}</Link>
                  </td>
                  <td>
                    {benchmarks.find((b) => b.id === r.benchmark_id)?.name ||
                      r.benchmark_id}
                  </td>
                  <td className="score">
                    {((r.score_bps || 0) / 100).toFixed(1)}
                    <small>%</small>
                  </td>
                  <td>
                    {r.n} items · {r.status}
                  </td>
                  <td>
                    <ShieldCheck size={15} />
                    {Math.max(0, r.round_count - 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ledger-empty">
          <div className="specimen">
            <FlaskConical size={47} strokeWidth={1.2} />
            <span className="specimen-line" />
          </div>
          <h3>
            {query || benchmark
              ? "No match just yet."
              : "The first mark is still yours to make."}
          </h3>
          <p>
            {query || benchmark
              ? "Try another model or benchmark."
              : "No finalized artifacts have been published here yet. Bring a real set of answers. We’ll put them to the test."}
          </p>
          <Link className="button primary" href="/submit">
            <Plus size={17} /> Submit a run
          </Link>
        </div>
      )}
      <div className="ledger-footnote">
        Finalized artifact grades only. Scores describe the complete committed dataset. Select one benchmark to compare scores; publishers choose their own difficulty and rubric. Model provenance and independence of challenger accounts are unverified.
      </div>
    </section>
  );
}
