import { authorize, body, failure, rateLimit } from "@/lib/auth";
import { storeEvidence } from "@/lib/evidence";
export async function POST(req: Request) {
  try {
    const owner = await authorize(req);
    await rateLimit(owner, "evidence", 30);
    const data = await body(req);
    if (!["dataset", "outputs"].includes(data.kind))
      return Response.json(
        { error: "Choose dataset or outputs evidence" },
        { status: 400 },
      );
    return Response.json(await storeEvidence(data.document, data.kind, owner), {
      status: 201,
    });
  } catch (error) {
    return failure(error);
  }
}
