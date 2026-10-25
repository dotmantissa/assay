import { processNext, syncRecords } from '../lib/jobs';
let running=true;process.on('SIGTERM',()=>{running=false;});process.on('SIGINT',()=>{running=false;});
let ticks=0;
while(running) {
  try {await processNext();if(ticks++%30===0) await syncRecords();} catch {console.error('Worker service unavailable. Retrying with saved progress.');}
  await new Promise(resolve=>setTimeout(resolve,8000));
}
