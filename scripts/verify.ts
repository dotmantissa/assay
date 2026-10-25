import { addresses, client, read } from "../lib/chain";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
for (const [name, address] of Object.entries(addresses())) {
  if (!address) throw new Error(`Missing ${name}`);
  const c = client();
  await c.request({
    method: "gen_getContractSchema",
    params: [address],
  } as never);
  const encoded = (await c.request({
    method: "gen_getContractCode",
    params: [address],
  } as never)) as string;
  const code = Buffer.from(encoded, "base64").toString("utf8");
  const file = {
    registry: "benchmark_registry",
    vault: "bond_vault",
    office: "assay_office",
  }[name];
  const hash = (s: string | Buffer) =>
    createHash("sha256").update(s).digest("hex");
  const local = readFileSync(`contracts/${file}.py`);
  if (
    hash(code) !== hash(local) &&
    hash(Buffer.from(code.replace(/^0x/, ""), "hex")) !== hash(local) &&
    hash(Buffer.from(code, "base64")) !== hash(local)
  )
    throw new Error(`Source mismatch for ${name}`);
  console.log(`${name}: schema and source verified at ${address}`);
}
console.log("Vault:", await read("vault", "configuration"));
console.log("Office:", await read("office", "configuration"));
console.log("Benchmarks:", await read("registry", "count"));
