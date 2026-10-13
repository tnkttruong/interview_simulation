import {NextResponse} from "next/server";
import {currentPlan} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 return tracedApi(req,"live.scenario.get",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{return NextResponse.json(currentPlan(user.id,(await params).id));}
 catch(error){return safeError(error);}});
}
