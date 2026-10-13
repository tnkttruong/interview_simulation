import "server-only";
import { NextResponse } from "next/server";
import { auth } from "./auth";
export async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user ?? null;
}
export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
export function unauthorized() { return errorResponse("Authentication required", 401); }
export function safeError(error: unknown) {
  if (error instanceof Error) {
    if (error.message.startsWith("Invalid session transition")) return errorResponse(error.message, 409);
    if (error.message.includes("UNIQUE constraint")) return errorResponse("Conflicting request", 409);
    if (error.message.includes("FOREIGN KEY constraint")) return errorResponse("Invalid reference", 400);
    if (error.name === "ZodError") return errorResponse("Invalid or missing fields", 400);
  }
  return errorResponse("Request could not be completed", 400);
}
