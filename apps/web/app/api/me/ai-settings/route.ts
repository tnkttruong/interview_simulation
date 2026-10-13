import {NextResponse} from "next/server";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
import {readSettings,saveSettings,settingsCatalog} from "@/server/ai-settings";
export const runtime="nodejs";
export async function GET(req:Request){
 return tracedApi(req,"settings.ai.read",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{return NextResponse.json({settings:readSettings(user.id),...settingsCatalog()},{headers:{"Cache-Control":"no-store"}});}
  catch(error){return safeError(error);}
 });
}
export async function PUT(req:Request){
 return tracedApi(req,"settings.ai.write",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{return NextResponse.json({settings:saveSettings(user.id,await req.json())},{headers:{"Cache-Control":"no-store"}});}
  catch(error){return safeError(error);}
 });
}
