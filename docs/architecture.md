# What makes a score authoritative

Assay stores benchmark definitions, committed output locations, full dataset item verdicts, descriptive scores and challenge history in GenLayer contracts. PostgreSQL stores accounts, immutable uploaded evidence, API key hashes and recoverable transaction jobs. It indexes public chain records for the interface. It never invents scores.

Email authentication uses Privy. The server verifies the access token, resolves the user's verified email and authorizes every write. A server signer sponsors Studio transactions. A public account identifier is derived from the Privy identity with a server HMAC so personal email addresses are never published on chain. This is a custodial relay: the relay can act for sponsored identities. Direct contract users are independently authorized by their own sender address.

## Three contracts

The benchmark registry makes dataset URL, SHA256 of exact response bytes, published rubric, scoring rules and sample size immutable. Registration checks the live document with independently fetched evidence. Publishing is open and contains no grading fee.

The assay office commits complete output evidence with a submitter supplied, unverified model label. A separate transaction binds the round to its successful finalized commitment receipt. Every round grades every dataset item, with no transaction-dependent selection or population confidence interpretation. Validators independently grade items, compare scaled scores per item and error sets, and preserve every recorded score/error flag during final regrading. They also check agreement on the settlement consequence.

Challenges regrade the same committed dataset and source snapshots during a fixed seven day window. Accumulated evidence keeps the lowest verified score per item; unsuccessful challenges cannot preserve optimistic scores or raise the headline. A drop exceeding the benchmark tolerance succeeds. Account inequality does not establish independent ownership, and regrade counts carry no resilience guarantee.

Vault locks bind run, round and role. The office atomically records their unique consumption. Finalized settlement intents execute asynchronously and idempotently; the office publishes a challenge outcome only after the vault result is finalized and acknowledged. Anyone may request replay or reconciliation. Unused locks can be refunded or expired through tombstoned office intents. Original assessments can be cancelled; incomplete rounds time out after one day and invalidate the assessment. Normal completion after the window releases the original bond. Release outcomes also wait for acknowledgement.

## Network asset boundary

Studio is gasless. Confirm native value transfers and token support on the network before describing native bonds as a specific asset. TVG is a product metric, not a token contract provided in the brief. Do not invent a TVG token, balances or fiat prices. Native escrow uses the network's actual value primitive; the interface reports its denomination and availability explicitly.

## Evidence and jobs

The submission API accepts complete JSON evidence or a public HTTPS URL. Uploaded bytes are immutable and publicly served by their SHA256. URL fetching rejects private addresses, redirects to private hosts, excessive response sizes and timeouts. Validators independently fetch and verify exact bytes against the committed hash. Reference sources contain committed text, its SHA256 and a publisher declared as_of timestamp; no live source is fetched during grading. Unavailable or mutated committed evidence prevents a verdict.

Jobs are durable in Neon. Each operation stores a transaction hash immediately after submission, then waits for finalized execution success and reads finalized resulting state before advancing. Terminal rejections discard only their failed broadcast, while polling failures preserve signed recovery data. Polling backoff and deadlines prevent one pending job from monopolizing the queue. Workers use database leases and one outstanding operation per job. Error states are visible and can be retried without silently creating a second run. The app can run a separate worker or call an authenticated cron endpoint.

The ledger is a reconciled index of finalized records. Complete successful snapshots replace stale entries; incomplete reads leave the previous index intact. Scores can be ranked only within one benchmark. Badges include benchmark identity, coverage, finality and unverified provenance and suspend scores during unresolved challenges. An empty network shows an honest empty state. Badges link to immutable run records. CI submits real model output through scoped API keys and reports a public record URL.
