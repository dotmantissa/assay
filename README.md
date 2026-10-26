# Assay

Good models deserve honest numbers.

Assay is an independent office for AI benchmark claims. A publisher locks a dataset and a public rubric. A submitter commits complete answers with an unverified model label. GenLayer validators grade every dataset item and publish a descriptive artifact score. Regrading uses the same committed evidence during a seven day challenge window. The result does not attest model provenance or population performance.

The interface reads actual contract records through a PostgreSQL index. There are no demo scores or invented leaderboard entries. A new installation starts empty.

## What is here

Next.js provides the public ledger, benchmark publishing, email sign in, submission tracking, challenge history, light and dark themes, API key management and embeddable badges. Privy verifies email accounts. The server sponsors transactions so people never need a wallet prompt.

Three Python contracts own the evidence and verdicts:

| Contract | Responsibility |
| --- | --- |
| Benchmark registry | Immutable dataset hash, rubric, full coverage and comparison rules |
| Assay office | Output commitment, finalized receipt binding, full coverage item consensus, publication and acknowledged challenge settlement |
| Bond vault | Native deposits, locks, authorized settlement and withdrawals |

The initial Reasoning under scrutiny benchmark contains 40 authored questions about probability, evidence, measurement and honest evaluation. It is a small public test, not a claim of comprehensive model capability. Its questions and reference answers live in `benchmarks/reasoning.json`.

## Run locally

Use Node.js 20.9 or later and Python 3.12 or later.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local`. Set the Privy app ID and server secret, Neon connection URL, Studio signer key, a random session secret and a separate cron secret. Keep `.env.local` private with `chmod 600 .env.local`.
3. Set `APP_URL` to the public HTTPS address you will use for uploaded evidence. Public URL submissions work without application hosted uploads. Configure that origin in Privy.
4. Run `npm run db:migrate`.
5. Run `npm run dev` and, in another terminal, `npm run worker`.

The worker uses durable database leases, serializes the shared signer and saves signed transactions before broadcasting. A restart resumes the same transaction. Failed steps remain visible and can be retried from the job page.

For production on a Node host, run `npm run build`, `npm start` and the separate worker. Put an HTTPS reverse proxy in front of the application with a 2 MB request limit. Do not deploy this as a static export.

## Vercel hosting

The public application is at https://assay-office.vercel.app. Set the production environment values from `.env.example`, including the three deployed contract addresses and `APP_URL` pointing to that origin. Leave `ASSAY_HTTP_TRANSPORT` empty; the curl option is only a local networking workaround. Database credentials and signer keys stay in Vercel encrypted secrets.

Vercel submissions start a worker after the HTTP response. Each invocation has a 300 second limit and advances saved jobs for up to 210 seconds, with eight seconds between steps. A database lock prevents overlapping worker windows. Jobs and signed transactions survive function restarts.

The `Advance assays` GitHub workflow calls the authenticated worker every five minutes. Its `ASSAY_CRON_SECRET` repository secret must match Vercel's `CRON_SECRET`. GitHub can delay scheduled runs; this is a recovery schedule rather than an exact completion deadline. Vercel also runs a daily recovery cron, which fits its Hobby plan. Both GET and POST worker requests require the same bearer secret. No public request can trigger this endpoint without authorization.

Only the public Privy app ID goes into the browser bundle. Never prefix database credentials, signer keys or server secrets with `NEXT_PUBLIC_`.

## Studio deployment

`deployments/studio.json` records deployed addresses, transaction hashes and previous unused revisions. `npm run contracts:deploy` resumes saved deployment transactions, verifies execution success and permanently wires the vault to its assay office. `npm run contracts:verify` checks deployed source bytes, schemas and live configuration against the repository.

Studio is gasless. This deployment disables financial bond backing with a zero minimum. The vault implements native escrow, but a Studio score must never be described as financially collateralized. TVG is transaction value generated, not an invented token.

Every round covers every dataset item. A successful finalized transaction receipt binds the exact commitment, including canonical address arguments. Transaction hashes do not select questions, so repeated commitments cannot select favorable subsets. Scores describe the complete committed artifact rather than a nominal random-sample confidence interval.

## Evidence format

A dataset is a JSON object containing `items`. Each item has a unique string `id` and a string `question`. Optional `reference` text supplies an answer key. Optional `sources` supplies up to three committed snapshots. Each contains `url`, `text`, `sha256` of the UTF-8 text and a timezone-qualified ISO `as_of` timestamp declared by the publisher. All rounds use those snapshots; live pages are not grading inputs.

An output document contains `outputs`, a map from every dataset item ID to the model’s full answer as a string. Its SHA256 must describe the exact served bytes. Reformatting a JSON document changes its hash.

Evidence uploads become immutable public documents. Do not include emails, credentials, private customer data or anything you cannot publish. External URL requests reject private network destinations and unsafe redirects, pin the validated destination address, and enforce time and size limits. Validators independently fetch and hash the evidence again.

## Submission API

Create an API key after email sign in. The full key appears once. The database retains its hash, and revoking the key immediately prevents further use.

`POST /api/submissions` accepts a bearer key and this JSON shape:

```json
{
  "benchmark_id": "your registered benchmark identifier",
  "model": "your model and release version",
  "outputs_url": "https://your.host/outputs.json",
  "outputs_hash": "the lowercase SHA256 of the exact output document"
}
```

Send an `Idempotency-Key` header when a request might be repeated. A successful request returns HTTP 202 with a job ID and the future record ID. Poll `GET /api/jobs/{id}` using the same bearer credential. A complete job links to `/runs/{result_id}`. A failed job can be retried with `POST /api/jobs/{id}`.

`POST /api/benchmarks` publishes a dataset of 1–100 items. Coverage is always complete; an optional sample_size must equal item count. `POST /api/runs/{id}/challenge` requests a fresh round. `POST /api/evidence` accepts a `kind` of `dataset` or `outputs` and a `document` object. API key administration requires an email session rather than another API key.

## CI and badges

The composite action in `.github/actions/assay` submits a real output document, waits for consensus and returns its public record URL. Use it from another repository as `dotmantissa/assay/.github/actions/assay@main`, with the inputs listed in its `action.yml`. Store the API key in GitHub Actions secrets.

The badge endpoint is `/api/badges/{run_id}`. It identifies the benchmark, coverage, finalized state and unverified attribution. Pending challenges suspend its percentage. Compare scores only within the same benchmark.

## Verify changes

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
npm run lint:contracts
npm run test:contracts
npm test
npm run typecheck
npm run lint
npm run build
npm run contracts:verify
npm run test:integration
```

Direct tests cover every contract, malformed evidence, authorization, bound escrow, acknowledgements/replay, release/cancellation/timeouts, full coverage, conservative regrades and validator comparisons. Live Studio integration tests use separate assay and vault instances. Their fixtures never become application leaderboard records.

The email relay is custodial: it is trusted to act for sponsored identities. Direct contract users authorize themselves by sender address. The public account identifier is a keyed hash of the Privy identity, so the application does not write email addresses to contracts.

The integration receipts in `tests/integration/studio-receipts.json` record actual operations and preserve earlier deployment history. Run the current suite with `ASSAY_EVIDENCE_REVISION` set to the pushed 40-character fixture commit. It uses isolated contracts and a funded vault to check payable deposits, full coverage consensus, settlement/replay, refunds and signed broadcast recovery. Production Studio financial backing remains disabled.
