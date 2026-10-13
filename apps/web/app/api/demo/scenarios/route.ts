import { NextResponse } from "next/server";
import { createScenario, listScenarios } from "@/server/demo";
import { currentUser, parsePage, safeError, tracedApi, unauthorized } from "@/server/request";
export const runtime = "nodejs";
export async function GET(request:Request) {
  return tracedApi(request,"scenarios.list",async()=>{
    const user=await currentUser(request);if(!user)return unauthorized();
    try { const {limit,offset}=parsePage(request); return NextResponse.json(listScenarios(user.id,limit,offset)); }
    catch(error){return safeError(error);}
  });
}
export async function POST(request:Request) {
  return tracedApi(request,"scenarios.create",async()=>{
    const user=await currentUser(request);if(!user)return unauthorized();
    try{return NextResponse.json(createScenario(user.id,await request.json()),{status:201});}
    catch(error){return safeError(error);}
  });
}
