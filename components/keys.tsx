"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Copy, KeyRound } from "lucide-react";
type Key = { id: string; label: string; prefix: string; created_at: string };
export function Keys() {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <EmailKeys />
  ) : (
    <p className="notice">Email sign in is awaiting configuration.</p>
  );
}
function EmailKeys() {
  const { authenticated, login, getAccessToken } = usePrivy();
  const [keys, setKeys] = useState<Key[]>([]),
    [newKey, setNewKey] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    if (!authenticated) return;
    const token = await getAccessToken();
    const res = await fetch("/api/keys", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await res.json();
    if (res.ok) setKeys(result);
    else setError(result.error);
  }, [authenticated, getAccessToken]);
  useEffect(() => {
    const timer = setTimeout(() => {
      load().catch(() => setError("Could not load your keys"));
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const label = new FormData(e.currentTarget).get("label");
    try {
      const token = await getAccessToken();
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setNewKey(result.key);
      setCopied(false);
      await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not create a key",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not revoke this key");
      await load();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not revoke this key",
      );
    }
  }
  if (!authenticated)
    return (
      <div className="large-empty">
        <KeyRound size={40} />
        <h2>Your release workflow, with receipts.</h2>
        <p>
          Sign in with email to create a key for the submission API and CI
          action.
        </p>
        <button className="button primary" onClick={login}>
          Sign in with email
        </button>
      </div>
    );
  return (
    <>
      <form className="key-form" onSubmit={create}>
        <label>
          Give this key a name
          <input
            name="label"
            required
            maxLength={80}
            placeholder="Release workflow"
          />
        </label>
        <button disabled={busy} className="button primary">
          <Plus size={17} /> Create key
        </button>
      </form>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {newKey && (
        <div className="success-state">
          <h2>Keep this one somewhere safe.</h2>
          <p>You’ll only see the full key here. Add it to your CI secrets.</p>
          <code>{newKey}</code>
          <button
            className="button secondary"
            onClick={async () => {
              await navigator.clipboard.writeText(newKey);
              setCopied(true);
            }}
          >
            <Copy size={15} />
            {copied ? "Copied" : "Copy key"}
          </button>
        </div>
      )}
      <div className="key-list">
        {keys.map((key) => (
          <div className="key-row" key={key.id}>
            <KeyRound size={20} />
            <div>
              <h3>{key.label}</h3>
              <code>{key.prefix}…</code>
            </div>
            <button
              className="button secondary"
              aria-label={`Revoke ${key.label}`}
              onClick={() => revoke(key.id)}
            >
              <Trash2 size={15} />
              Revoke
            </button>
          </div>
        ))}
      </div>
      {!keys.length && (
        <p className="field-help">
          No active keys yet. Each key can publish evidence and submit assays
          for your account.
        </p>
      )}
    </>
  );
}
