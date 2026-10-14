import "server-only";
import {eq} from "drizzle-orm";
import {db} from "./db/client";
import {scenarios,aiCallAttempts} from "./db/schema";
export function deleteInterviewData(ownerId:string){
 return db.transaction(tx=>{
  // Cascade removes revisions, CV texts, live questions, hints, turns and audit events.
  const result=tx.delete(scenarios).where(eq(scenarios.ownerId,ownerId)).run();
  // Operation hashes are pseudonymous, but remove them along with account interview data.
  tx.delete(aiCallAttempts).where(eq(aiCallAttempts.ownerId,ownerId)).run();
  return {deletedScenarios:result.changes};
 });
}
