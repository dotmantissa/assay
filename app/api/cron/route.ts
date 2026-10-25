import { equalSecret } from "@/lib/auth";
import { syncRecords } from "@/lib/jobs";
import { runWorkerWindow } from "@/lib/worker";
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !equalSecret(req.headers.get("authorization") || "", `Bearer ${secret}`)
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    const progress = await runWorkerWindow();
    await syncRecords();
    return Response.json({ ok: true, ...progress }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Worker unavailable" }, { status: 503 });
  }
}
export const POST = GET;
