import { NextResponse } from "next/server";
import { createScenario, listScenarios } from "@/server/demo";
import { currentUser, safeError, unauthorized } from "@/server/request";
export const runtime = "nodejs";
export async function GET(request:Request) {
  const user=await currentUser(request);
  return user ? NextResponse.json(listScenarios(user.id)) : unauthorized();
}
export async function POST(request:Request) {
  const user=await currentUser(request);
  if(!user) return unauthorized();
  try { return NextResponse.json(createScenario(user.id,await request.json()),{status:201}); }
  catch(error) { return safeError(error); }
}
