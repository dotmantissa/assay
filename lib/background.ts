import { after } from "next/server";
import { runWorkerWindow } from "./worker";

export function startHostedWorker() {
  if (process.env.VERCEL !== "1") return;
  after(async () => {
    try {
      await runWorkerWindow();
    } catch {
      // The scheduled trigger resumes database progress after transient failures.
      console.error("Assay worker paused. Saved progress will be retried.");
    }
  });
}
