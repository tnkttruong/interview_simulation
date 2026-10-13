import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {and,count,desc,eq,gte} from "drizzle-orm";
import {DomainError} from "@interview/core";
import {db} from "./db/client";
import {aiCallAttempts} from "./db/schema";

const HOUR_MS=60*60*1000;
const LEASE_MS=120000; // longer than the provider timeout; stale leases recover after a crash
const DUPLICATE_MS=60000;
const OWNER_HOURLY_CAP=80;
const GLOBAL_HOURLY_CAP=400;

function operationHash(input:unknown):string {
 return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Atomic SQLite reservation: no external AI call can start before a spend slot is owned.
 * Keep failed attempts in the ledger so repeated provider errors still consume the hourly budget.
 */
export async function withAiBudget<T>(ownerId:string,operation:unknown,work:()=>Promise<T>):Promise<T>{
 const key=operationHash(operation), id=randomUUID(), started=Date.now();
 db.transaction(tx=>{
  const owned=and(eq(aiCallAttempts.ownerId,ownerId),gte(aiCallAttempts.startedAt,started-HOUR_MS));
  const countOwner=tx.select({total:count()}).from(aiCallAttempts).where(owned).get()!.total;
  if(countOwner>=OWNER_HOURLY_CAP)throw new DomainError("limit","Hourly AI request budget reached");
  const countGlobal=tx.select({total:count()}).from(aiCallAttempts)
   .where(gte(aiCallAttempts.startedAt,started-HOUR_MS)).get()!.total;
  if(countGlobal>=GLOBAL_HOURLY_CAP)throw new DomainError("limit","Server AI request budget reached");
  const active=tx.select({id:aiCallAttempts.id}).from(aiCallAttempts)
   .where(and(eq(aiCallAttempts.ownerId,ownerId),eq(aiCallAttempts.status,"running"),
    gte(aiCallAttempts.expiresAt,started))).limit(1).get();
  if(active)throw new DomainError("conflict","An AI request is already running for this account");
  const duplicate=tx.select({id:aiCallAttempts.id}).from(aiCallAttempts)
   .where(and(eq(aiCallAttempts.ownerId,ownerId),eq(aiCallAttempts.operationKey,key),
    eq(aiCallAttempts.status,"completed"),gte(aiCallAttempts.startedAt,started-DUPLICATE_MS)))
   .orderBy(desc(aiCallAttempts.startedAt)).limit(1).get();
  if(duplicate)throw new DomainError("conflict","Duplicate AI request in cooldown");
  tx.insert(aiCallAttempts).values({id,ownerId,operationKey:key,status:"running",
   startedAt:started,expiresAt:started+LEASE_MS,finishedAt:null}).run();
 });
 let success=false;
 try{
  const result=await work();
  success=true;
  return result;
 }finally{
  db.update(aiCallAttempts).set({status:success?"completed":"failed",finishedAt:Date.now()})
   .where(and(eq(aiCallAttempts.id,id),eq(aiCallAttempts.ownerId,ownerId))).run();
 }
}
