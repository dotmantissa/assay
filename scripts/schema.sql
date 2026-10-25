CREATE TABLE IF NOT EXISTS accounts (
 id text PRIMARY KEY, privy_id text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS evidence (
 hash text PRIMARY KEY CHECK(length(hash)=64), body text NOT NULL, owner_id text REFERENCES accounts(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS api_keys (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES accounts(id), label text NOT NULL,
 digest text NOT NULL UNIQUE, prefix text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES accounts(id), kind text NOT NULL CHECK(kind IN ('publish','submit','challenge')),
 payload jsonb NOT NULL, state text NOT NULL DEFAULT 'queued', step integer NOT NULL DEFAULT 0,
 tx_hash text, transactions jsonb NOT NULL DEFAULT '[]', result_id text NOT NULL,
 attempts integer NOT NULL DEFAULT 0, lease_until timestamptz, lease_token uuid, error text,
 idempotency_key text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(state,lease_until,created_at);
CREATE TABLE IF NOT EXISTS public_records (
 id text NOT NULL, kind text NOT NULL CHECK(kind IN ('benchmark','run')), record jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(kind,id)
);
CREATE TABLE IF NOT EXISTS rate_limits (
 bucket text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL
);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS signed_tx text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS broadcast_hash text;
CREATE TABLE IF NOT EXISTS worker_locks(name text PRIMARY KEY,token uuid NOT NULL,expires_at timestamptz NOT NULL);
