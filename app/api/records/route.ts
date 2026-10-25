import { records } from '@/lib/records';
export async function GET(){const data=await records();return Response.json(data,{status:data.available?200:503,headers:{'Cache-Control':'no-store'}});}
