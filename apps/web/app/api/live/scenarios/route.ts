import {NextResponse} from "next/server";
import {createLiveScenario} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function POST(req:Request){
 return tracedApi(req,"live.scenario.create",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{return NextResponse.json(await createLiveScenario(user.id,await req.json()),{status:201});}
 catch(error){return safeError(error);}});
}
