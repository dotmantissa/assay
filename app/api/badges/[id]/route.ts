import { read } from "@/lib/chain";
import type { Run } from "@/lib/types";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const run = await read<Run>("office", "get_run", [id]);
    if (
      run.score_bps === null ||
      !["published", "slashed", "challenged", "grading"].includes(run.status)
    )
      return new Response("No published score", { status: 404 });
    const label = run.status === "slashed" ? "Challenged" : "Assayed";
    const score = (run.score_bps / 100).toFixed(1) + "%";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="32" role="img" aria-label="${label}: ${score}"><rect width="180" height="32" fill="#000"/><rect width="95" height="32" fill="#EDE734"/><g font-family="Verdana,sans-serif" font-size="12" text-anchor="middle"><text x="47" y="21" fill="#000">${label}</text><text x="137" y="21" fill="#FFF">${score}</text></g></svg>`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=60",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'",
      },
    });
  } catch {
    return new Response("Record unavailable", { status: 503 });
  }
}
