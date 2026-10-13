import { NextResponse } from "next/server";
import { sqlite } from "@/server/db/client";
export const runtime = "nodejs";
export async function GET() {
  try { sqlite.prepare("SELECT 1").get(); return NextResponse.json({ status:"ok", mode:"demo" }); }
  catch { return NextResponse.json({ status:"unavailable" }, { status:503 }); }
}
