import { JobProgress } from "@/components/job";
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="page-body form-page">
      <div className="page-heading">
        <div>
          <h1>Proof takes a little patience.</h1>
          <p>Every step has a receipt. Nothing disappears between visits.</p>
        </div>
      </div>
      <JobProgress id={id} />
    </div>
  );
}
