import { describe,it,expect } from 'vitest';
import { TransactionStatus } from 'genlayer-js/types';
import { publicAddress,datasetSchema,outputSchema } from '../../lib/evidence';
import { equalSecret,digestKey,accountId } from '../../lib/auth';
import { executionSucceeded } from '../../lib/chain';

describe('Evidence boundaries',()=>{
 it.each(['127.0.0.1','10.1.2.3','172.16.0.1','192.168.3.4','169.254.169.254','100.64.1.2','198.18.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','2001:db8::1'])('blocks private or reserved destination %s',ip=>expect(publicAddress(ip)).toBe(false));
 it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])('accepts global address %s',ip=>expect(publicAddress(ip)).toBe(true));
 it('requires unique dataset ids and bounded source lists',()=>{
 const item={id:'question',question:'How would you check this claim?'};
 expect(datasetSchema.safeParse({items:[item,item]}).success).toBe(false);
 expect(datasetSchema.safeParse({items:[{...item,sources:['http://private.example']}]}).success).toBe(false);
 expect(datasetSchema.safeParse({items:[item]}).success).toBe(true);
 });
 it('rejects shaped scores in place of full model answers',()=>{
 expect(outputSchema.safeParse({outputs:{q1:99}}).success).toBe(false);
 expect(outputSchema.safeParse({outputs:{q1:'The complete answer'}}).success).toBe(true);
 });
});
describe('Authentication and receipts',()=>{
 it('compares secrets without prefix acceptance',()=>{expect(equalSecret('abc','abcd')).toBe(false);expect(equalSecret('abc','abc')).toBe(true);expect(equalSecret('abc','abd')).toBe(false);});
 it('stores hashes rather than usable API credentials',()=>expect(digestKey('assay_example')).toMatch(/^[a-f0-9]{64}$/));
 it('keeps personal identity out of public attribution',()=>{process.env.SESSION_SECRET='test-fixture-key';expect(accountId('did:privy:test')).not.toContain('privy');expect(accountId('did:privy:test')).toBe(accountId('did:privy:test'));});
 it('does not equate accepted lifecycle with execution success',()=>{expect(executionSucceeded({statusName:TransactionStatus.FINALIZED})).toBe(false);expect(executionSucceeded({statusName:TransactionStatus.ACCEPTED,consensus_data:{final:true,leader_receipt:[{execution_result:'ERROR'} as never]}})).toBe(false);expect(executionSucceeded({consensus_data:{final:true,leader_receipt:[{execution_result:'SUCCESS'} as never]}})).toBe(true);});
});
