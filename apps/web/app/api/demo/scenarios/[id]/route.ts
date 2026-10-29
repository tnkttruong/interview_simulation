import { NextResponse } from "next/server";
import { changeScenario, getScenario, updateScenario } from "@/server/demo";
import { currentUser, safeError, tracedApi, unauthorized } from "@/server/request";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context) {
  return tracedApi(request,"scenario.get",async()=>{
    const user=await currentUser(request);if(!user)return unauthorized();
    try{return NextResponse.json(getScenario(user.id,(await params).id));}
    catch(error){return safeError(error);}
  });
}
export async function PATCH(request:Request,{params}:Context) {
  return tracedApi(request,"scenario.update",async()=>{
    const user=await currentUser(request);if(!user)return unauthorized();
    try{
      const body=await request.json();
      if(body && typeof body==="object" && "action" in body){
        return NextResponse.json(changeScenario(user.id,(await params).id,body));
      }
      return NextResponse.json(updateScenario(user.id,(await params).id,body));
    }
    catch(error){return safeError(error);}
  });
}
