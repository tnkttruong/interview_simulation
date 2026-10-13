import { NextResponse } from "next/server";
import { changeSession, getEvidence, getSession } from "@/server/demo";
import { currentUser, safeError, unauthorized } from "@/server/request";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context) {
  const user=await currentUser(request);if(!user)return unauthorized();
  try{
    const id=(await params).id;
    if(new URL(request.url).searchParams.get("include")==="events")
      return NextResponse.json(getEvidence(user.id,id));
    return NextResponse.json(getSession(user.id,id));
  }catch(error){return safeError(error);}
}
export async function PATCH(request:Request,{params}:Context) {
  const user=await currentUser(request);if(!user)return unauthorized();
  try{return NextResponse.json(changeSession(user.id,(await params).id,await request.json()));}
  catch(error){return safeError(error);}
}
