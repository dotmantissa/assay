import './network';
import { PrivyClient } from '@privy-io/server-auth';
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from './db';
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function accountId(privyId:string) {
  if (!process.env.SESSION_SECRET) throw new Error('Identity service is not configured');
  return createHmac('sha256',process.env.SESSION_SECRET).update(privyId).digest('hex');
}
export function digestKey(key:string) { return createHash('sha256').update(key).digest('hex'); }
export function equalSecret(a:string,b:string) { const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length && timingSafeEqual(aa,bb); }
export async function authorize(req:Request, allowKey=true) {
  const token = req.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new HttpError(401,'Please sign in with your email');
  const sql=db();
  if (token.startsWith('assay_')) {
    if (!allowKey) throw new HttpError(403,'Use your email session to manage API keys');
    const rows=await sql`SELECT owner_id FROM api_keys WHERE digest=${digestKey(token)} AND revoked_at IS NULL`;
    if (!rows[0]) throw new HttpError(401,'This API key is not active');
    return String(rows[0].owner_id);
  }
  const appId=process.env.NEXT_PUBLIC_PRIVY_APP_ID, secret=process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) throw new HttpError(503,'Email sign in is awaiting configuration');
  let privyId:string;
  try {
    const privy=new PrivyClient(appId,secret);
    const claims=await privy.verifyAuthToken(token);
    const user=await privy.getUser(claims.userId);
    if (!user.email?.address) throw new HttpError(403,'An email account is required');
    privyId=user.id;
  } catch(error) { if(error instanceof HttpError) throw error; throw new HttpError(401,'Your session has expired. Please sign in again'); }
  const id=accountId(privyId);
  await sql`INSERT INTO accounts(id,privy_id) VALUES(${id},${privyId}) ON CONFLICT(id) DO NOTHING`;
  return id;
}
export async function rateLimit(owner:string, action:string, maximum=10) {
  const bucket=owner+':'+action+':'+Math.floor(Date.now()/3600000);
  const rows=await db()`INSERT INTO rate_limits(bucket,count,expires_at) VALUES(${bucket},1,now()+interval '1 hour') ON CONFLICT(bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count`;
  if (Number(rows[0].count)>maximum) throw new HttpError(429,'You have reached the hourly limit. Give the examiners a breather');
}
export async function body(req:Request) {
  if(Number(req.headers.get('content-length')||0)>2_000_000) throw new HttpError(413,'This upload is too large');
  const reader=req.body?.getReader();
  if(!reader) throw new HttpError(400,'Please send a JSON document');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw new HttpError(413,'This upload is too large');}chunks.push(value);}
  const raw=Buffer.concat(chunks).toString('utf8');
  if(Buffer.byteLength(raw)>2_000_000) throw new HttpError(413,'This upload is too large');
  try { return JSON.parse(raw); } catch { throw new HttpError(400,'Please send valid JSON'); }
}
export function failure(error:unknown) {
  if(error instanceof HttpError) return Response.json({error:error.message},{status:error.status});
  if(error && typeof error==='object' && 'issues' in error) return Response.json({error:'Check the required fields and try again'},{status:400});
  return Response.json({error:'The service could not complete this request. Please try again'},{status:503});
}
export { randomUUID };
