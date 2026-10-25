import { Keys } from "@/components/keys";
export default function KeysPage() {
  return (
    <div className="page-body form-page">
      <div className="page-heading">
        <div>
          <h1>Make proof part of the release.</h1>
          <p>
            API keys for your scripts, pipelines and the occasional late night
            push.
          </p>
        </div>
      </div>
      <Keys />
    </div>
  );
}
