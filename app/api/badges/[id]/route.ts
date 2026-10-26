import { read } from "@/lib/chain";
import type { Run, Benchmark } from "@/lib/types";
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!));
export async function GET(_req: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    const {id} = await params;
    const run = await read<Run>("office", "get_run", [id]);
    const benchmark = await read<Benchmark>("registry", "get_benchmark", [run.benchmark_id]);
    const certified = ["published", "completed", "slashed"].includes(run.status) && run.score_bps !== null;
    const score = certified ? (run.score_bps! / 100).toFixed(1) + "%" : "Assessment pending / unavailable";
    const line1 = `Artifact grade: ${score} · ${run.status} · finalized state`;
    const line2 = `${benchmark.name} [${benchmark.id}] · ${run.n || 0}/${benchmark.item_count} items`;
    const line3 = "Model attribution unverified · dataset result only";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="90" role="img" aria-label="${escape(line1+'; '+line2+'; '+line3)}"><title>${escape(line1+'; '+line2+'; '+line3)}</title><rect width="620" height="90" fill="#000"/><g font-family="Verdana,sans-serif" font-size="12"><text x="12" y="23" fill="#EDE734">${escape(line1)}</text><text x="12" y="46" fill="#FFF" textLength="590" lengthAdjust="spacingAndGlyphs">${escape(line2)}</text><text x="12" y="70" fill="#FFF">${escape(line3)}</text></g></svg>`;
    return new Response(svg, {headers: {"Content-Type":"image/svg+xml", "Cache-Control":"no-store", "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'"}});
  } catch {
    return new Response("Record unavailable", {status:503, headers:{"Cache-Control":"no-store"}});
  }
}
