import { randomUUID } from "node:crypto";
import { db } from "./db";
import { processNext } from "./jobs";

// Leave time for the final RPC call and lease cleanup within Vercel's 300 seconds.
export async function runWorkerWindow() {
  const sql = db();
  const token = randomUUID();
  const lock =
    await sql`INSERT INTO worker_locks(name,token,expires_at) VALUES('studio_window',${token},now()+interval '300 seconds') ON CONFLICT(name) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE worker_locks.expires_at<now() RETURNING token`;
  if (!lock[0]) return { advanced: 0 };
  const deadline = Date.now() + 210_000;
  let advanced = 0;
  try {
    while (Date.now() < deadline) {
      if (!(await processNext())) break;
      advanced++;
      if (Date.now() + 8000 >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
    return { advanced };
  } finally {
    await sql`DELETE FROM worker_locks WHERE name='studio_window' AND token=${token}`;
  }
}
