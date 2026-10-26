import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { client, executionSucceeded, resumeBroadcast } from "../lib/chain";
import { createHash } from "node:crypto";
import { TransactionHashVariant } from "genlayer-js/types";
import type { CalldataEncodable } from "genlayer-js/types";
const path = "deployments/studio.json";
mkdirSync("deployments", { recursive: true });
const state = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      network: "studionet",
      rpc: "https://studio.genlayer.com/api",
      addresses: {},
      transactions: {},
    };
function save() {
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}
const sourceHashes = Object.fromEntries(Object.entries({registry:"benchmark_registry", vault:"bond_vault", office:"assay_office"}).map(([name,file]) => [name,createHash("sha256").update(readFileSync(`contracts/${file}.py`)).digest("hex")]));
if (state.protocol !== 2) {
  const previous = {...state};
  delete previous.history;
  state.history = [...(state.history || []), previous];
  state.addresses = {};
  state.transactions = {};
  state.wiringVerified = false;
  state.protocol = 2;
  state.sourceHashes = sourceHashes;
  save();
}
if (JSON.stringify(state.sourceHashes) !== JSON.stringify(sourceHashes))
  throw new Error("Source changed during deployment; finish verification before replacing a saved deployment");
let activeKey = "";
state.signed ||= {};
const c = client(true, async (raw, hash) => {
  if (!activeKey) throw new Error("Missing deployment operation identifier");
  state.signed[activeKey] = {raw, hash};
  save();
});
async function rpc<T>(call: () => Promise<T>): Promise<T> {
  for (;;) {
    try { return await call(); } catch (error) {
      if (!(error instanceof Error) || (!/rate limit/i.test(error.message) && error.name !== "TransactionReceiptNotFoundError")) throw error;
      console.log("Studio rate window or broadcast pending; saved deployment retained. Retrying in 60 seconds.");
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
  }
}
async function wait(hash: string) {
  for (let i = 0; i < 150; i++) {
    const tx = await rpc(() => c.getTransaction({
      hash: hash as import("genlayer-js/types").TransactionHash,
    }));
    if (String(tx.statusName) === "FINALIZED") {
      if (!executionSucceeded(tx)) {
        console.error(
          "Execution error:",
          tx.consensus_data?.leader_receipt?.[0]?.error,
        );
        throw new Error("Deployment execution failed");
      }
      return tx;
    }
    if (["UNDETERMINED", "CANCELED"].includes(String(tx.statusName)))
      throw new Error("Deployment rejected");
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error("Receipt still pending. Rerun to resume saved transaction.");
}
for (const name of ["registry", "vault", "office"]) {
  if (state.addresses[name]) continue;
  const filename = {
    registry: "benchmark_registry",
    vault: "bond_vault",
    office: "assay_office",
  }[name];
  const args: CalldataEncodable[] =
    name === "vault"
      ? [0]
      : name === "office"
        ? [state.addresses.registry, state.addresses.vault]
        : [];
  activeKey = name;
  if (!state.transactions[name]) {
    state.transactions[name] = await rpc(() => state.signed[name]
      ? resumeBroadcast(state.signed[name].raw, state.signed[name].hash)
      : c.deployContract({
      code: readFileSync(`contracts/${filename}.py`),
      args,
    }));
    save();
    console.log(`${name} submitted: ${state.transactions[name]}`);
  }
  const tx = await wait(state.transactions[name]);
  state.addresses[name] = tx.to_address || tx.recipient;
  if (!state.addresses[name])
    throw new Error("Receipt has no deployed address");
  delete state.signed[name];
  save();
  await rpc(() => c.request({
    method: "gen_getContractSchema",
    params: [state.addresses[name]],
  } as never));
  save();
  console.log(`${name} verified: ${state.addresses[name]}`);
}
if (!state.wiringVerified) {
  if (!state.transactions.configure) {
    activeKey = "configure";
    state.transactions.configure = await rpc(() => state.signed.configure
      ? resumeBroadcast(state.signed.configure.raw, state.signed.configure.hash)
      : c.writeContract({
      address: state.addresses.vault,
      functionName: "configure",
      args: [state.addresses.office],
      value: 0n,
    }));
    save();
  }
  await wait(state.transactions.configure);
  delete state.signed.configure;
  save();
  const config = (await rpc(() => c.readContract({
    address: state.addresses.vault,
    functionName: "configuration",
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  }))) as Record<string, unknown>;
  if (
    String(config.office).toLowerCase() !== state.addresses.office.toLowerCase()
  )
    throw new Error("Vault wiring mismatch");
  state.wiringVerified = true;
  save();
}
console.log("Studio deployment and wiring verified");
