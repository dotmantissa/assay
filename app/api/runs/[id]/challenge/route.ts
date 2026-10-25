import { authorize,failure,rateLimit,HttpError } from '@/lib/auth';
import { enqueue } from '@/lib/jobs';
import { read } from '@/lib/chain';
import type { Run,Benchmark } from '@/lib/types';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}) {try {const owner=await authorize(req);await rateLimit(owner,'challenge',5);const {id}=await params;const run=await read<Run>('office','get_run',[id]);if(run.owner===owner || run.status!=='published')throw new HttpError(409,'This run is not available for your challenge');const b=await read<Benchmark>('registry','get_benchmark',[run.benchmark_id]);if(b.item_count-run.excluded.length<b.sample_size)throw new HttpError(409,'Every fresh sample has been used');return Response.json(await enqueue(owner,'challenge',{run_id:id},req.headers.get('idempotency-key')),{status:202});}catch(error){return failure(error);}}
