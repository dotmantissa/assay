import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, body, failure, digestKey, rateLimit } from "@/lib/auth";
import { db } from "@/lib/db";
export async function GET(req: Request) {
  try {
    const owner = await authorize(req, false);
    return Response.json(
      await db()`SELECT id,label,prefix,created_at FROM api_keys WHERE owner_id=${owner} AND revoked_at IS NULL ORDER BY created_at DESC`,
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request) {
  try {
    const owner = await authorize(req, false);
    await rateLimit(owner, "keys", 5);
    const { label } = z
      .object({ label: z.string().min(1).max(80) })
      .parse(await body(req));
    const key = "assay_" + randomBytes(32).toString("base64url");
    const id = randomUUID();
    await db()`INSERT INTO api_keys(id,owner_id,label,digest,prefix) VALUES(${id},${owner},${label},${digestKey(key)},${key.slice(0, 14)})`;
    return Response.json(
      { id, key, label },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
