import { Flame, FileCheck2, Scale, ShieldCheck } from "lucide-react";
export default function About() {
  return (
    <div className="page-body about-page">
      <div className="page-heading"><div><h1>Put the claim through the fire.</h1><p>Independent grading of submitted artifacts, with a public record.</p></div><Flame size={52} strokeWidth={1.2} /></div>
      <article className="prose">
        <h2>What an Assay result proves.</h2>
        <p>GenLayer validators grade the answers submitted to a public benchmark. The model label is supplied by the submitter. Assay does not verify which model produced those answers, its settings, or whether someone edited or copied them. Public reference answers make this an artifact assessment, not an attestation of model performance.</p>
        <div className="principle"><FileCheck2 size={29} /><div><h2>Lock every grading input.</h2><p>A publisher commits the dataset, rubric and source snapshots. A submitter commits complete answers. SHA256 hashes bind the exact document bytes. References contain committed text, its digest and a publisher declared as-of time. Examiners use that text in every round; changing a live page cannot change the committed facts.</p></div></div>
        <h2>Every item counts.</h2>
        <p>Each round grades the entire dataset, up to 100 items. Transaction hashes bind commitments and do not select questions. Repeating commitments cannot choose a favorable subset. The percentage describes these specific submitted answers on this specific dataset. It is not a population confidence interval or a general model capability estimate.</p>
        <div id="comparison" className="principle"><Scale size={29} /><div><h2>Agree on grades and consequences.</h2><p>Validators independently grade each answer. Binary scores require exact item agreement. Scaled scores are compared per item within the published tolerance, together with overlap of error sets. Before publication every numeric grade and error flag must match the recorded item grades. Validators must also agree on the direction of challenge settlement.</p></div></div>
        <div className="principle"><ShieldCheck size={29} /><div><h2>Regrade the same evidence.</h2><p>For seven days after publication, another account can challenge the result. Each challenge regrades the complete dataset. The headline retains the lowest verified score for each item across completed rounds, even when the total drop does not exceed the settlement tolerance. A challenge succeeds when that accumulated drop exceeds the tolerance. Regrades do not consume questions or extend the window. Different accounts do not prove independent ownership; regrade counts are not resilience badges.</p></div></div>
        <h2>Settlement and completion.</h2>
        <p>Each bond is bound to one run, round and role. Proposed challenge outcomes remain pending until the vault confirms settlement. Failed settlement or acknowledgement can be recovered without moving funds twice. Unused bonds can be refunded. An unfinished original can be cancelled; unfinished rounds expire after one day and invalidate the assessment as inconclusive. After the challenge window, normal completion releases the original bond. Release also waits for vault confirmation.</p>
        <h2>Studio financial backing.</h2>
        <p>This deployment sponsors transactions for email accounts and disables native financial backing. No Studio score claims collateral. The vault supports payable native deposits, bound locks, refunds and releases for funded deployments. Native withdrawal transfers run after finalization.</p>
        <h2>Public records and comparisons.</h2>
        <p>Public results use finalized chain state. Badges identify the benchmark, item coverage and assessment status. A pending challenge suspends the badge percentage. Publishers choose their own difficulty and rubric, so scores can be ranked only within one benchmark.</p>
        <h2>Your email stays out of the public record.</h2>
        <p>Privy verifies email sign in. The server hashes account identities for public attribution and sponsors calls. The relay is trusted to act for email accounts; direct users authorize their own sender. Datasets, answers, source snapshots and verdicts are public. Keep private information out of submitted evidence.</p>
        <h2>Recoverable release workflows.</h2>
        <p>API keys and the included GitHub action can submit complete artifacts. Follow the job to its finalized record. Pending broadcasts are checked before resubmission. A rejected transaction can be retried with a fresh transaction after chain state is reconciled. Polling backoff allows later jobs to progress.</p>
        <a className="button secondary" href="https://github.com/dotmantissa/assay" target="_blank" rel="noreferrer">Read the code and API guide</a>
      </article>
    </div>
  );
}
