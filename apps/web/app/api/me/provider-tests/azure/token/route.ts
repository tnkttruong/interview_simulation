import { NextResponse } from "next/server";
import { DomainError } from "@interview/core";
import { currentUser, safeError, tracedApi, unauthorized } from "@/server/request";
import { issueDiagnosticSpeechToken } from "@/server/provider-tests";

export const runtime = "nodejs";
export async function POST(req: Request) {
  return tracedApi(req, "provider_tests.azure.token", async () => {
    const user = await currentUser(req);
    if (!user) return unauthorized();
    try {
      const token = await issueDiagnosticSpeechToken(user.id);
      return NextResponse.json(token, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      if (error instanceof DomainError) {
        const status = error.kind === "limit" ? 429 : error.kind === "conflict" ? 409 : 400;
        return NextResponse.json({ error: error.message }, { status, headers: { "Cache-Control": "no-store" } });
      }
      return safeError(error);
    }
  });
}
