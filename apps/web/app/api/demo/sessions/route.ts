import { NextResponse } from "next/server";
import { createSession, listSessions } from "@/server/demo";
import { currentUser, safeError, unauthorized } from "@/server/request";
export const runtime="nodejs";
export async function GET(request:Request) {
  const user=await currentUser(request);
  return user ? NextResponse.json(listSessions(user.id)) : unauthorized();
}
export async function POST(request:Request) {
  const user=await currentUser(request);if(!user)return unauthorized();
  try{return NextResponse.json(createSession(user.id,await request.json()),{status:201});}
  catch(error){return safeError(error);}
}
