import {NextResponse} from "next/server";
import {exposeHint} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 return tracedApi(req,"live.hint.expose",async()=>{const user=await currentUser(req);if(!user)return unauthorized();
 try{return NextResponse.json(await exposeHint(user.id,(await params).id));}
 catch(error){return safeError(error);}});
}
