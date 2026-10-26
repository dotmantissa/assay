import { authorize, failure, rateLimit, HttpError } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { read } from "@/lib/chain";
import type { Run } from "@/lib/types";
import { startHostedWorker } from "@/lib/background";
export const maxDuration = 300;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await authorize(req);
    await rateLimit(owner, "challenge", 5);
    const { id } = await params;
    const run = await read<Run>("office", "get_run", [id]);
    if (run.owner === owner || run.status !== "published")
      throw new HttpError(409, "This run is not available for your challenge");
    if (Date.now() / 1000 >= run.challenge_until)
      throw new HttpError(409, "The challenge window has closed");
    const job = await enqueue(
      owner,
      "challenge",
      { run_id: id, round_number: run.round_count },
      req.headers.get("idempotency-key"),
    );
    startHostedWorker();
    return Response.json(job, { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
