import "./network";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { CalldataEncodable, GenLayerTransaction } from "genlayer-js/types";
import { readFileSync } from "node:fs";
import { keccak256, parseEventLogs } from "viem";

export function client(
  signer = false,
  onSigned?: (raw: `0x${string}`, hash: string) => Promise<void>,
) {
  const key = process.env.GENLAYER_PRIVATE_KEY;
  if (signer && !key)
    throw new Error("The transaction service is not configured");
  const account = signer
    ? privateKeyToAccount(key as `0x${string}`)
    : undefined;
  if (account && onSigned) {
    const original = account.signTransaction;
    account.signTransaction = (async (...args: Parameters<typeof original>) => {
      const raw = await original(...args);
      await onSigned(raw, keccak256(raw));
      return raw;
    }) as typeof original;
  }
  return createClient({ chain: studionet, ...(account ? { account } : {}) });
}
export function addresses() {
  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse(
      readFileSync("deployments/studio.json", "utf8"),
    ).addresses;
  } catch {
    /* First deployment */
  }
  return {
    registry: process.env.GENLAYER_REGISTRY_ADDRESS || saved.registry,
    vault: process.env.GENLAYER_VAULT_ADDRESS || saved.vault,
    office: process.env.GENLAYER_OFFICE_ADDRESS || saved.office,
  };
}
export async function read<T>(
  which: keyof ReturnType<typeof addresses>,
  method: string,
  args: CalldataEncodable[] = [],
): Promise<T> {
  const address = addresses()[which];
  if (!address) throw new Error("Contracts are awaiting deployment");
  return (await client().readContract({
    address: address as `0x${string}`,
    functionName: method,
    args,
    jsonSafeReturn: true,
  })) as T;
}
export function executionSucceeded(tx: GenLayerTransaction): boolean {
  return tx.consensus_data?.leader_receipt?.[0]?.execution_result === "SUCCESS";
}
export async function receipt(hash: string) {
  const tx = await client().getTransaction({
    hash: hash as import("genlayer-js/types").TransactionHash,
  });
  if (["ACCEPTED", "FINALIZED"].includes(String(tx.statusName))) {
    if (!executionSucceeded(tx))
      throw new Error(`Contract execution failed for ${hash}`);
    return tx;
  }
  if (["UNDETERMINED", "CANCELED"].includes(String(tx.statusName)))
    throw new Error(`Consensus did not accept ${hash}`);
  return null;
}
export async function write(
  which: keyof ReturnType<typeof addresses>,
  method: string,
  args: CalldataEncodable[] = [],
  value = 0n,
  onSigned?: (raw: `0x${string}`, hash: string) => Promise<void>,
) {
  const address = addresses()[which];
  if (!address) throw new Error("Contracts are awaiting deployment");
  return (await client(true, onSigned).writeContract({
    address: address as `0x${string}`,
    functionName: method,
    args,
    value,
  })) as string;
}

export async function resumeBroadcast(raw: string, rootHash: string) {
  const c = client();
  let tx;
  try {
    tx = await c.getTransactionReceipt({ hash: rootHash as `0x${string}` });
  } catch {
    try {
      await c.sendRawTransaction({
        serializedTransaction: raw as `0x${string}`,
      });
    } catch {
      /* Same signed transaction may already be accepted. */
    }
    tx = await c.getTransactionReceipt({ hash: rootHash as `0x${string}` });
  }
  if (tx.status === "reverted") throw new Error("Broadcast reverted");
  const events = parseEventLogs({
    abi: studionet.consensusMainContract!.abi,
    eventName: "NewTransaction",
    logs: tx.logs,
  });
  const event = events[0] as unknown as { args: { txId: string } };
  if (!event?.args.txId)
    throw new Error("Consensus transaction receipt is pending");
  return event.args.txId;
}
