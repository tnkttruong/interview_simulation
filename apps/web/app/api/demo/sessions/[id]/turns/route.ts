import { NextResponse } from "next/server";
import { getSession, submitAnswer } from "@/server/demo";
import { currentUser, safeError, unauthorized } from "@/server/request";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context) {
  const user=await currentUser(request);if(!user)return unauthorized();
  try{return NextResponse.json(getSession(user.id,(await params).id).turns);}
  catch(error){return safeError(error);}
}
export async function POST(request:Request,{params}:Context) {
  const user=await currentUser(request);if(!user)return unauthorized();
  try{return NextResponse.json(submitAnswer(user.id,(await params).id,await request.json()),{status:201});}
  catch(error){return safeError(error);}
}
