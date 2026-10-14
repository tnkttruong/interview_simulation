import {NextResponse} from "next/server";
import {startLive} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function POST(req:Request){
 return tracedApi(req,"live.session.start",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{return NextResponse.json(startLive(user.id,await req.json()),{status:201});}
 catch(error){return safeError(error);}});
}
