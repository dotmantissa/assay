import { authorize, failure } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await authorize(req, false);
    const { id } = await params;
    z.uuid().parse(id);
    await db()`UPDATE api_keys SET revoked_at=now() WHERE id=${id} AND owner_id=${owner}`;
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
