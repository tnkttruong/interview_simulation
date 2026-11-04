import { NextResponse } from "next/server";
import { z } from "zod";
import { DomainError, voiceByLocale } from "@interview/core";
import { AUDIO_SAMPLES } from "@/shared/audio-samples";
import { currentUser, safeError, tracedApi, unauthorized } from "@/server/request";
import { providerTestsEnabled } from "@/server/provider-tests";
import { createThrottle } from "@/server/guards";

export const runtime = "nodejs";
const sampleId = z.object({ id: z.enum(AUDIO_SAMPLES.map(sample => sample.id) as [
  (typeof AUDIO_SAMPLES)[number]["id"], ...(typeof AUDIO_SAMPLES)[number]["id"][]
]) }).strict();
const throttle = createThrottle(3000);

/** Fixed Azure TTS samples: authenticated, opt-in, bounded, and no user-provided SSML. */
export async function POST(request: Request) {
  return tracedApi(request, "provider_tests.audio_sample", async () => {
    const user = await currentUser(request);
    if (!user) return unauthorized();
    try {
      if (!providerTestsEnabled()) throw new DomainError("invalid", "Enable provider diagnostics to generate sample audio.");
      const { id } = sampleId.parse(await request.json());
      const sample = AUDIO_SAMPLES.find(item => item.id === id)!;
      const region = process.env.AZURE_SPEECH_REGION;
      const key = process.env.AZURE_SPEECH_KEY;
      if (!key || !region || !/^[a-z0-9-]{2,35}$/.test(region)) {
        throw new DomainError("invalid", "Configure Azure Speech region and key.");
      }
      if (!throttle.tryAcquire(user.id)) throw new DomainError("limit", "Audio sample cooldown: retry after a few seconds.");
      const voice = voiceByLocale[sample.locale][0];
      const text = sample.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      const ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="' +
        sample.locale + '"><voice name="' + voice + '">' + text + "</voice></speak>";
      const response = await fetch("https://" + region + ".tts.speech.microsoft.com/cognitiveservices/v1", {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
        },
        body: ssml,
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      });
      if (!response.ok) throw new DomainError("invalid", "Azure sample synthesis failed.");
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength > 768000) {
        throw new DomainError("limit", "Azure sample audio was empty or unexpectedly large.");
      }
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      return safeError(error);
    }
  });
}
