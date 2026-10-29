import { NextResponse } from "next/server";
import { currentUser, safeError, tracedApi, unauthorized } from "@/server/request";
import { providerTestStatus } from "@/server/provider-tests";

export const runtime = "nodejs";
export async function GET(req: Request) {
  return tracedApi(req, "provider_tests.status", async () => {
    const user = await currentUser(req);
    if (!user) return unauthorized();
    try {
      return NextResponse.json(providerTestStatus(user.id), { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return safeError(error); }
  });
}
