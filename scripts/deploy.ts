import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { client, executionSucceeded } from '../lib/chain';
import type { CalldataEncodable } from 'genlayer-js/types';
const path = 'deployments/studio.json';
mkdirSync('deployments', { recursive: true });
const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { network: 'studionet', rpc: 'https://studio.genlayer.com/api', addresses: {}, transactions: {} };
function save() { writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2) + '\n'); renameSync(`${path}.tmp`, path); }
const c = client(true);
async function wait(hash: string) {
  for (let i = 0; i < 150; i++) {
    const tx = await c.getTransaction({ hash: hash as import('genlayer-js/types').TransactionHash });
    if (['ACCEPTED', 'FINALIZED'].includes(String(tx.statusName))) {
      if (!executionSucceeded(tx)) {
        console.error('Execution error:', tx.consensus_data?.leader_receipt?.[0]?.error);
        throw new Error('Deployment execution failed');
      }
      return tx;
    }
    if (['UNDETERMINED', 'CANCELED'].includes(String(tx.statusName))) throw new Error('Deployment rejected');
    await new Promise(resolve => setTimeout(resolve, 8000));
  }
  throw new Error('Receipt still pending. Rerun to resume saved transaction.');
}
for (const name of ['registry', 'vault', 'office']) {
  if (state.addresses[name]) continue;
  const filename = { registry: 'benchmark_registry', vault: 'bond_vault', office: 'assay_office' }[name];
  const args: CalldataEncodable[] = name === 'vault' ? [0] : name === 'office' ? [state.addresses.registry, state.addresses.vault] : [];
  if (!state.transactions[name]) {
    state.transactions[name] = await c.deployContract({ code: readFileSync(`contracts/${filename}.py`), args });
    save(); console.log(`${name} submitted: ${state.transactions[name]}`);
  }
  const tx = await wait(state.transactions[name]);
  state.addresses[name] = tx.to_address || tx.recipient;
  if (!state.addresses[name]) throw new Error('Receipt has no deployed address');
  await c.request({ method: 'gen_getContractSchema', params: [state.addresses[name]] } as never);
  save(); console.log(`${name} verified: ${state.addresses[name]}`);
}
if (!state.wiringVerified) {
  if (!state.transactions.configure) {
    state.transactions.configure = await c.writeContract({ address: state.addresses.vault, functionName: 'configure', args: [state.addresses.office], value: 0n }); save();
  }
  await wait(state.transactions.configure);
  const config = await c.readContract({ address: state.addresses.vault, functionName: 'configuration', args: [] }) as Record<string, unknown>;
  if (String(config.office).toLowerCase() !== state.addresses.office.toLowerCase()) throw new Error('Vault wiring mismatch');
  state.wiringVerified = true; save();
}
console.log('Studio deployment and wiring verified');
