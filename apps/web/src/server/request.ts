import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import pino from "pino";
import { DomainError } from "@interview/core";
import { auth } from "./auth";

const logger = pino({
  level: "info",
  base: undefined,
  redact: { paths: ["req.headers.authorization", "req.headers.cookie", "password", "answer", "jobDescription", "transcript", "secret", "token"], remove: true }
});

export async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}

/** Trace only fixed operation names, never request bodies or URLs with query strings. */
export async function tracedApi(request: Request, operation: string, handler: () => Promise<NextResponse>) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let response: NextResponse;
  try {
    response = await handler();
  } catch {
    response = NextResponse.json({ error: "Request could not be completed" }, { status: 500 });
  }
  response.headers.set("x-request-id", requestId);
  logger.info({ requestId, operation, method: request.method, status: response.status, durationMs: Date.now() - startedAt }, "api.request");
  return response;
}

export function parsePage(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawLimit = params.get("limit") ?? "20";
  const rawOffset = params.get("offset") ?? "0";
  if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset)) throw new DomainError("invalid", "Invalid pagination");
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw new DomainError("invalid", "Invalid pagination");
  }
  return { limit, offset };
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export function unauthorized() { return errorResponse("Authentication required", 401); }
export function safeError(error: unknown) {
  if (error instanceof DomainError) {
    switch (error.kind) {
      case "transition": return errorResponse(error.message, 409);
      case "quota": return errorResponse(error.message, 409);
      case "limit": return errorResponse(error.message, 429);
      case "conflict": return errorResponse(error.message || "Version or idempotency conflict", 409);
      case "not_found": return errorResponse(error.message || "Resource not found", 404);
      case "invalid": return errorResponse(error.message || "Request could not be completed", 400);
    }
  }
  if (error instanceof Error) {
    if (error.name === "ZodError") return errorResponse("Invalid or missing fields", 400);
    if (error instanceof SyntaxError) return errorResponse("Invalid or missing fields", 400);
    // Database constraint violations surface as driver errors without a typed class.
    if (error.message.includes("UNIQUE constraint")) return errorResponse("Conflicting request", 409);
    if (error.message.includes("FOREIGN KEY constraint")) return errorResponse("Invalid reference", 400);
  }
  console.error("api.unexpected_error:", error);
  logger.error({ errorName: error instanceof Error ? error.name : "unknown", errorMsg: error instanceof Error ? error.message : String(error) }, "api.unexpected_error");
  return errorResponse(error instanceof Error ? error.message : "Request could not be completed", 500);
}
