import { authorize, failure, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await authorize(req);
    const { id } = await params;
    z.uuid().parse(id);
    const rows =
      await db()`SELECT id,kind,state,step,tx_hash,transactions,result_id,error,created_at,updated_at FROM jobs WHERE id=${id} AND owner_id=${owner}`;
    if (!rows[0]) throw new HttpError(404, "Job not found");
    return Response.json(rows[0], { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = await authorize(req);
    const { id } = await params;
    z.uuid().parse(id);
    const rows =
      await db()`UPDATE jobs SET state='queued',error=NULL,lease_until=NULL WHERE id=${id} AND owner_id=${owner} AND state='failed' RETURNING id,state`;
    if (!rows[0]) throw new HttpError(409, "This job is not awaiting a retry");
    return Response.json(rows[0]);
  } catch (error) {
    return failure(error);
  }
}
