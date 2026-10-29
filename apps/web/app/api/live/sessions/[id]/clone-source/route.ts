import {NextResponse} from "next/server";
import {getLiveSessionCloneSource} from "@/server/live";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
export const runtime="nodejs";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 return tracedApi(req,"live.session.clone_source",async()=>{
  const user=await currentUser(req);
  if(!user)return unauthorized();
  try{
   const source=getLiveSessionCloneSource(user.id,(await params).id);
   return NextResponse.json(source,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return safeError(error);}
 });
}
