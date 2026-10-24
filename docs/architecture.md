# What makes a score authoritative

Assay stores benchmark definitions, committed output locations, sample seeds, item verdicts, confidence intervals and challenge history in GenLayer contracts. PostgreSQL stores accounts, immutable uploaded evidence, API key hashes and recoverable transaction jobs. It indexes public chain records for the interface. It never invents scores.

Email authentication uses Privy. The server verifies the access token, resolves the user's verified email and authorizes every write. A server signer sponsors Studio transactions. A public account identifier is derived from the Privy identity with a server HMAC so personal email addresses are never published on chain. This is a custodial relay: the relay can act for sponsored identities. Direct contract users are independently authorized by their own sender address.

## Three contracts

The benchmark registry makes dataset URL, SHA256 of exact response bytes, published rubric, scoring rules and sample size immutable. Registration checks the live document with independently fetched evidence. Publishing is open and contains no grading fee.

The assay office commits output evidence before sample creation. A separate transaction starts each round. The round seed comes from the VM transaction identity if supported by the pinned runner; the exact source must be verified against the deployed runtime. Hashing a sender chosen seed is not advertised as unbiasable randomness. Items are sampled without replacement, excluding all previous round samples. Each sampled item gets an independent transaction that fetches both locked evidence documents and uses a fresh network consensus decision. Finalization independently regrades the complete sample and checks binary item equality, aggregate tolerance and Jaccard overlap of error sets before publishing. Zero shared errors only agrees when both error sets are empty. Confidence intervals use Wilson for binary items and a bounded Hoeffding interval for scaled items.

A fresh challenge round pays a challenge bond and excludes previously sampled items. Every round remains public. A materially lower challenged score slashes the original run bond to the challenger. An unsuccessful challenge transfers the challenge bond to the original submitter. Settlements use an office authorized vault call and cannot be repeated. Withdrawable balances use checks before native transfers.

## Network asset boundary

Studio is gasless. Confirm native value transfers and token support on the network before describing native bonds as a specific asset. TVG is a product metric, not a token contract provided in the brief. Do not invent a TVG token, balances or fiat prices. Native escrow uses the network's actual value primitive; the interface reports its denomination and availability explicitly.

## Evidence and jobs

The submission API accepts complete JSON evidence or a public HTTPS URL. Uploaded bytes are immutable and publicly served by their SHA256. URL fetching rejects private addresses, redirects to private hosts, excessive response sizes and timeouts. Validators independently fetch and verify exact bytes against the committed hash. Unavailable or mutated evidence prevents a verdict.

Jobs are durable in Neon. Each operation stores a transaction hash immediately after submission, then polls execution success and reads resulting state before advancing. Workers use database leases and one outstanding operation per job. Error states are visible and can be retried without silently creating a second run. The app can run a separate worker or call an authenticated cron endpoint.

The leaderboard is a real indexed view of published scores. An empty network shows an honest empty state. Badges link to immutable run records. CI submits real model output through scoped API keys and reports a public record URL.
