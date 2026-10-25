import { Flame, FileCheck2, Scale, ShieldCheck } from "lucide-react";
export default function About() {
  return (
    <div className="page-body about-page">
      <div className="page-heading">
        <div>
          <h1>Put the claim through the fire.</h1>
          <p>
            An assay office exists because the seller’s word is never quite
            enough.
          </p>
        </div>
        <Flame size={52} strokeWidth={1.2} />
      </div>
      <article className="prose">
        <h2>A benchmark number should have witnesses.</h2>
        <p>
          Model providers usually choose the test, run it privately and grade
          their own homework. Assay gives those answers an independent hearing.
          The test is public, the evidence is locked, and GenLayer validators
          have to agree on the result.
        </p>
        <div className="principle">
          <FileCheck2 size={29} />
          <div>
            <h2>First, lock the evidence.</h2>
            <p>
              A publisher registers a dataset URL, its SHA256 hash, a rubric and
              scoring rules. A submitter commits a complete set of outputs
              before sampling starts. Editing either document changes its hash
              and stops the assay.
            </p>
          </div>
        </div>
        <h2>A small sample with a long paper trail.</h2>
        <p>
          The sample ranks dataset positions by SHA256 using the verified
          commitment transaction hash. Selection is reproducible and without
          replacement. Every challenged round excludes all earlier samples.
        </p>
        <p>
          This Studio implementation verifies the commitment through Studio’s
          public RPC. Transaction hash grinding is possible, so this is not an
          unbiased randomness beacon. The receipt and sample seed remain public
          for inspection.
        </p>
        <div id="comparison" className="principle">
          <Scale size={29} />
          <div>
            <h2>Agree on the mistakes, too.</h2>
            <p>
              Binary correctness requires the same verdict for every item. For
              graded scales, validators must stay within the benchmark’s score
              tolerance and meet its minimum Jaccard overlap for the set of
              incorrect items. Matching totals while disagreeing about the
              errors fails the comparison.
            </p>
          </div>
        </div>
        <p>
          Each sampled answer gets its own consensus transaction. Before
          publication, the full sample is independently graded again. The final
          comparison checks the earlier grades as well as the new panel’s
          result. Wilson intervals describe binary scores; bounded Hoeffding
          intervals describe graded scales. Both use 95% confidence.
        </p>
        <div className="principle">
          <ShieldCheck size={29} />
          <div>
            <h2>Good scores can take a challenge.</h2>
            <p>
              Anyone other than the submitter can request another assay on a
              fresh sample. A challenge succeeds only when the new score falls
              beyond the published tolerance and its confidence interval sits
              below the original interval. Every round stays visible. A run that
              survives three challenges earns a clearer mark of resilience.
            </p>
          </div>
        </div>
        <h2>What Studio does and doesn’t promise.</h2>
        <p>
          This deployment runs on GenLayer Studio and sponsors transactions for
          email accounts. Studio is gasless. Native bond backing is disabled, so
          no score here claims financial collateral. The vault implements native
          escrow for networks where actual funding is available. TVG measures
          transaction value; this application does not invent a TVG token.
        </p>
        <h2>Your email stays out of the public record.</h2>
        <p>
          Privy verifies email sign in. The server turns your account identity
          into a private keyed hash for public attribution and sponsors the
          contract calls. This means the transaction relay is trusted to act for
          email accounts. Direct contract users retain their own sender
          authorization.
        </p>
        <p>
          Datasets, answers, sampled verdicts and challenge rounds are public.
          Uploaded evidence is immutable. API keys are stored as hashes and can
          be revoked. No email address, access token or application secret
          belongs in the evidence you publish.
        </p>
        <h2>Use Assay in your release workflow.</h2>
        <p>
          Create an API key, commit your outputs through the submission API, and
          follow the job until it publishes. The included GitHub action can do
          this for every model release. An Assayed badge links readers directly
          to the run’s public record.
        </p>
        <a
          className="button secondary"
          href="https://github.com/dotmantissa/assay"
          target="_blank"
          rel="noreferrer"
        >
          Read the code and API guide
        </a>
      </article>
    </div>
  );
}
