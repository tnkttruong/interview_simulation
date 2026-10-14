import {NextResponse} from "next/server";
import {prepareLiveQuestion} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 return tracedApi(req,"live.question.prepare",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{return NextResponse.json(await prepareLiveQuestion(user.id,(await params).id));}
 catch(error){return safeError(error);}});
}
