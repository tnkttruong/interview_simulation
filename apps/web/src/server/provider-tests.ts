import "server-only";
import { z } from "zod";
import { DomainError } from "@interview/core";
import { cliAvailable, runCli } from "./ai-cli";
import { withAiBudget } from "./ai-budget";
import { readSettings, settingsCatalog } from "./ai-settings";
import { createThrottle } from "./guards";

const modelId = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
const cliInput = z.object({
  provider: z.enum(["codex_cli", "agy_cli"]),
  model: modelId,
}).strict();
const azureThrottle = createThrottle(30_000);

export function providerTestsEnabled() {
  return process.env.ENABLE_PROVIDER_TESTS === "true";
}

export function providerTestStatus(ownerId: string) {
  const region = process.env.AZURE_SPEECH_REGION;
  return {
    enabled: providerTestsEnabled(),
    ai: settingsCatalog(),
    defaults: readSettings(ownerId),
    azure: {
      configured: !!(process.env.AZURE_SPEECH_KEY && region && /^[a-z0-9-]{2,35}$/.test(region)),
      region: region && /^[a-z0-9-]{2,35}$/.test(region) ? region : null,
    },
  };
}

function assertDiagnosticAccess() {
  if (!providerTestsEnabled())
    throw new DomainError("invalid", "Provider tests are disabled. Set ENABLE_PROVIDER_TESTS=true on a trusted server.");
}

/** A fixed challenge, not a user-supplied prompt. It exercises the exact production CLI adapter. */
export async function probeCli(ownerId: string, payload: unknown) {
  assertDiagnosticAccess();
  const { provider, model } = cliInput.parse(payload);
  if (!cliAvailable(provider))
    throw new DomainError("invalid", "CLI is disabled or not installed under the web server account.");
  const started = Date.now();
  const answer = await withAiBudget(ownerId, { action: "diagnostic.cli", provider, model }, () =>
    runCli(provider, model,
      'Connection test only. Return exactly one JSON object: {"code":"CLI_TEST_OK"}. No prose, no markdown. Do not use tools.')
  );
  let parsed: unknown;
  try { parsed = JSON.parse(answer); }
  catch { throw new DomainError("invalid", "CLI responded, but the output was not valid JSON."); }
  if (!parsed || typeof parsed !== "object" || !("code" in parsed) || parsed.code !== "CLI_TEST_OK")
    throw new DomainError("invalid", "CLI responded, but did not return the expected test code.");
  return { ok: true, provider, model, durationMs: Date.now() - started };
}

/** Short-lived Azure token for an explicit browser STT smoke test, independent of a live session.
 * No subscription key is returned. The test is operator opt-in and shares durable AI rate limits.
 */
export async function issueDiagnosticSpeechToken(ownerId: string) {
  assertDiagnosticAccess();
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region || !/^[a-z0-9-]{2,35}$/.test(region))
    throw new DomainError("invalid", "Azure Speech is not configured on this server.");
  if (!azureThrottle.tryAcquire(ownerId))
    throw new DomainError("limit", "Azure diagnostic token cooldown (30 seconds).");
  return withAiBudget(ownerId, { action: "diagnostic.azure.token" }, async () => {
    const response = await fetch("https://" + region + ".api.cognitive.microsoft.com/sts/v1.0/issueToken", {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    if (!response.ok)
      throw new DomainError("invalid", "Azure token exchange failed (HTTP " + response.status + ").");
    const token = await response.text();
    if (!token || token.length > 4096)
      throw new DomainError("invalid", "Azure returned an invalid speech token.");
    return { token, region, expiresIn: 540 };
  });
}
