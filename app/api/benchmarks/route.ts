import { z } from 'zod';
import { authorize,body,failure,rateLimit } from '@/lib/auth';
import { enqueue } from '@/lib/jobs';
import { datasetSchema, fetchEvidence } from '@/lib/evidence';
import { createHash } from 'node:crypto';
const schema=z.object({name:z.string().min(1).max(120),dataset_url:z.url().startsWith('https://'),content_hash:z.string().regex(/^[a-f0-9]{64}$/),rubric:z.string().min(20).max(12000),sample_size:z.number().int().min(1).max(100),scale:z.number().int().min(1).max(100),tolerance_bps:z.number().int().min(0).max(1000),overlap_bps:z.number().int().min(5000).max(10000)}).strict();
export async function POST(req:Request) {try {const owner=await authorize(req);await rateLimit(owner,'publish',5);const data=schema.parse(await body(req));const raw=await fetchEvidence(data.dataset_url);const dataset=datasetSchema.parse(JSON.parse(raw));if(createHash('sha256').update(raw).digest('hex')!==data.content_hash || data.sample_size>dataset.items.length) return Response.json({error:'The dataset hash or sample size does not match'},{status:400});const job=await enqueue(owner,'publish',data,req.headers.get('idempotency-key'));return Response.json(job,{status:202});}catch(error){return failure(error);}}
