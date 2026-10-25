"use client";
import { usePrivy } from "@privy-io/react-auth";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
export function ChallengeButton({ id }: { id: string }) {
  return process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
    <EmailChallenge id={id} />
  ) : null;
}
function EmailChallenge({ id }: { id: string }) {
  const { authenticated, login, getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const router = useRouter();
  async function challenge() {
    if (!authenticated) {
      login();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/runs/${id}/challenge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": crypto.randomUUID(),
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.push(`/jobs/${result.id}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not request a fresh assay",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <button className="button primary" disabled={busy} onClick={challenge}>
        <Scale size={17} />
        {busy ? "Requesting a fresh assay" : "Challenge this score"}
      </button>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
