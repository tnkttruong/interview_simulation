import {NextResponse} from "next/server";
import {planLiveScenario} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 return tracedApi(req,"live.scenario.plan",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{
  let body: { cvText?: string; instruction?: string } = {};
  try { body = await req.json(); } catch {}
  return NextResponse.json(await planLiveScenario(user.id,(await params).id, body?.cvText, body?.instruction));
 }
 catch(error){return safeError(error);}});
}
