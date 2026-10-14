import { NextResponse } from "next/server";
import {DomainError} from "@interview/core";
import { createSession, listSessions } from "@/server/demo";
import { currentUser, parsePage, safeError, tracedApi, unauthorized } from "@/server/request";
export const runtime="nodejs";
export async function GET(request:Request) {
  return tracedApi(request,"sessions.list",async()=>{
    const user=await currentUser(request);if(!user)return unauthorized();
    try{
      const {limit,offset}=parsePage(request);
      const requestedMode=new URL(request.url).searchParams.get("mode");
      if(requestedMode && !["live","demo"].includes(requestedMode))
        throw new DomainError("invalid","Unknown interview mode");
      const mode=requestedMode as "live"|"demo"|null;
      return NextResponse.json(listSessions(user.id,limit,offset,mode??undefined));
    }
    catch(error){return safeError(error);}
  });
}
export async function POST(request:Request) {
  return tracedApi(request,"sessions.create",async()=>{
    const user=await currentUser(request);if(!user)return unauthorized();
    try{return NextResponse.json(createSession(user.id,await request.json()),{status:201});}
    catch(error){return safeError(error);}
  });
}
