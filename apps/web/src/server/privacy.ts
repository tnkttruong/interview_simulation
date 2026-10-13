import "server-only";
import {eq} from "drizzle-orm";
import {db} from "./db/client";
import {scenarios} from "./db/schema";
export function deleteInterviewData(ownerId:string){
 return db.transaction(tx=>{
  // Cascade removes revisions, CV texts, live questions, hints, turns and audit events.
  const result=tx.delete(scenarios).where(eq(scenarios.ownerId,ownerId)).run();
  return {deletedScenarios:result.changes};
 });
}
