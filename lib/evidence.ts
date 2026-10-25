import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';
import { z } from 'zod';
import { HttpError } from './auth';
import { db } from './db';
export const itemSchema=z.object({id:z.string().min(1).max(100),question:z.string().min(1).max(16000),reference:z.string().max(16000).optional(),sources:z.array(z.url().startsWith('https://')).max(3).optional()}).strict();
export const datasetSchema=z.object({items:z.array(itemSchema).min(1).max(10000)}).strict().refine(d=>new Set(d.items.map(i=>i.id)).size===d.items.length);
export const outputSchema=z.object({outputs:z.record(z.string().min(1).max(100),z.string().max(24000))}).strict();
export function publicAddress(ip:string) {
  if (isIP(ip)===4) { const p=ip.split('.').map(Number); return !(p[0]===0 || p[0]===10 || p[0]===127 || p[0]>=224 || p[0]===169&&p[1]===254 || p[0]===172&&p[1]>=16&&p[1]<=31 || p[0]===192&&(p[1]===168||p[1]===0) || p[0]===100&&p[1]>=64&&p[1]<=127 || p[0]===198&&(p[1]===18||p[1]===19)); }
  // Accept globally routed IPv6 only. IPv4 mapped and local ranges stay excluded.
  return isIP(ip)===6 && /^[23][0-9a-f]{3}:/i.test(ip) && !ip.toLowerCase().startsWith('2001:db8:');
}
export async function fetchEvidence(input:string, redirects=0):Promise<string> {
  const url=new URL(input);
  if(url.protocol!=='https:' || url.username || url.password || (url.port&&url.port!=='443')) throw new HttpError(400,'Use a public HTTPS evidence URL');
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const ips=await lookup(host,{all:true});
  if(!ips.length || ips.some(ip=>!publicAddress(ip.address))) throw new HttpError(400,'Evidence must be on the public internet');
  const ip=ips[0];
  return await new Promise<string>((resolve,reject)=>{
    const request=https.get(url,{lookup:((_hostname:unknown,_options:unknown,callback:(error:null,address:string,family:number)=>void)=>callback(null,ip.address,ip.family)) as never,timeout:12000,headers:{Accept:'application/json'}},res=>{
      if(res.statusCode && [301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if(redirects>=3 || !res.headers.location) { reject(new HttpError(400,'Too many evidence redirects'));return; }
        fetchEvidence(new URL(res.headers.location,url).href,redirects+1).then(resolve,reject);return;
      }
      if(res.statusCode!==200) {res.resume();reject(new HttpError(400,'The evidence URL did not return a document'));return;}
      const chunks:Buffer[]=[];let size=0;
      res.on('data',chunk=>{size+=chunk.length;if(size>2_000_000){request.destroy();reject(new HttpError(413,'Evidence is too large'));}else chunks.push(chunk);});
      res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));res.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(new HttpError(408,'The evidence host took too long')));request.on('error',reject);
  });
}
export async function storeEvidence(data:unknown,kind:'dataset'|'outputs',owner:string) {
  const parsed=kind==='dataset'?datasetSchema.parse(data):outputSchema.parse(data);
  const text=JSON.stringify(parsed);
  if(Buffer.byteLength(text)>2_000_000) throw new HttpError(413,'Evidence is too large');
  const hash=createHash('sha256').update(text).digest('hex');
  await db()`INSERT INTO evidence(hash,body,owner_id) VALUES(${hash},${text},${owner}) ON CONFLICT(hash) DO NOTHING`;
  const base=process.env.APP_URL;
  if(!base || !base.startsWith('https://')) throw new HttpError(503,'Public evidence hosting needs an HTTPS application address');
  return {hash,url:`${base.replace(/\/$/,'')}/api/evidence/${hash}`};
}
