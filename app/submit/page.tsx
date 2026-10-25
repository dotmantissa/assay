import { records } from "@/lib/records";
import { EvidenceForm } from "@/components/forms";
export const dynamic = "force-dynamic";
export default async function Submit({
  searchParams,
}: {
  searchParams: Promise<{ benchmark?: string }>;
}) {
  const [data, params] = await Promise.all([records(), searchParams]);
  return (
    <div className="page-body form-page">
      <div className="page-heading">
        <div>
          <h1>Let the answers speak.</h1>
          <p>Commit your model’s outputs. We’ll take it from there.</p>
        </div>
      </div>
      <EvidenceForm
        kind="submit"
        benchmarks={data.benchmarks}
        selected={params.benchmark}
      />
    </div>
  );
}
