import { z } from "zod";
import { createHash } from "node:crypto";
import { authorize, body, failure, rateLimit, HttpError } from "@/lib/auth";
import { enqueue } from "@/lib/jobs";
import { read } from "@/lib/chain";
import { outputSchema, fetchEvidence } from "@/lib/evidence";
import type { Benchmark } from "@/lib/types";
import { startHostedWorker } from "@/lib/background";
export const maxDuration = 300;
const schema = z
  .object({
    benchmark_id: z.string().min(1).max(80),
    model: z.string().min(1).max(120),
    outputs_url: z.url().startsWith("https://"),
    outputs_hash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function POST(req: Request) {
  try {
    const owner = await authorize(req);
    await rateLimit(owner, "submit");
    const data = schema.parse(await body(req));
    const benchmark = await read<Benchmark>("registry", "get_benchmark", [
      data.benchmark_id,
    ]);
    const raw = await fetchEvidence(data.outputs_url);
    const outputs = outputSchema.parse(JSON.parse(raw));
    if (
      createHash("sha256").update(raw).digest("hex") !== data.outputs_hash ||
      Object.keys(outputs.outputs).length !== benchmark.item_count
    )
      throw new HttpError(400, "The output hash or item count does not match");
    const job = await enqueue(owner, "submit", data, req.headers.get("idempotency-key"));
    startHostedWorker();
    return Response.json(job, { status: 202 });
  } catch (error) {
    return failure(error);
  }
}
