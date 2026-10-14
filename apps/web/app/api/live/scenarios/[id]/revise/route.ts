import {NextResponse} from "next/server";
import {reviseLiveScenario} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 return tracedApi(req,"live.scenario.revise",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{return NextResponse.json(await reviseLiveScenario(user.id,(await params).id,await req.json()));}
 catch(error){return safeError(error);}});
}
