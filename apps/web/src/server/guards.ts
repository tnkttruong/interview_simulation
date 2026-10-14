import "server-only";

/**
 * Bounded in-memory throttle. Expired keys are swept periodically and the map is hard-capped,
 * so memory cannot grow without bound. Per-process only: use Redis/DB if you run multiple replicas.
 */
export function createThrottle(windowMs:number,maxKeys=10000){
 const hits=new Map<string,number>();
 let lastSweep=0;
 return {
  /** Returns true (and records the hit) when the key is outside its cool-down window. */
  tryAcquire(key:string,now=Date.now()):boolean{
   if(now-lastSweep>=windowMs&&hits.size>0){
    lastSweep=now;
    for(const [k,t] of hits)if(now-t>=windowMs)hits.delete(k);
   }
   const last=hits.get(key);
   if(last!==undefined&&now-last<windowMs)return false;
   if(hits.size>=maxKeys){
    const oldest=hits.keys().next().value;
    if(oldest!==undefined)hits.delete(oldest);
   }
   hits.delete(key);hits.set(key,now);
   return true;
  },
  size:()=>hits.size
 };
}
