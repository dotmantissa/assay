import { db } from "@/lib/db";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ hash: string }> },
) {
  const { hash } = await params;
  if (!/^[a-f0-9]{64}$/.test(hash))
    return new Response("Evidence not found", { status: 404 });
  try {
    const rows = await db()`SELECT body FROM evidence WHERE hash=${hash}`;
    if (!rows[0]) return new Response("Evidence not found", { status: 404 });
    return new Response(String(rows[0].body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'",
        ETag: `"${hash}"`,
      },
    });
  } catch {
    return new Response("Evidence service unavailable", { status: 503 });
  }
}
