import { db } from "./db";
import type { Benchmark, Run } from "./types";
export async function records() {
  try {
    const rows =
      await db()`SELECT kind,record,updated_at FROM public_records ORDER BY updated_at DESC`;
    return {
      benchmarks: rows
        .filter((r) => r.kind === "benchmark" && r.record.protocol === 2 && r.record.finality === "finalized")
        .map((r) => r.record as Benchmark),
      runs: rows.filter((r) => r.kind === "run" && r.record.protocol === 2 && r.record.finality === "finalized").map((r) => r.record as Run),
      available: true,
    };
  } catch {
    return {
      benchmarks: [] as Benchmark[],
      runs: [] as Run[],
      available: false,
    };
  }
}
export const percent = (bps: number) => (bps / 100).toFixed(1);
