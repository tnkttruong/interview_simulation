import { describe, expect, it } from "vitest";
import { transition, getDemoQuestion, validateSpeechConfig } from "./index";
describe("interview state machine", () => {
  it("requires approval/preflight flow before start", () => {
    expect(() => transition("CREATED", "start")).toThrow();
    expect(transition("CREATED", "enterPreflight")).toBe("PREFLIGHT");
    expect(transition("PREFLIGHT", "passPreflight")).toBe("READY");
    expect(transition("READY", "start")).toBe("IN_PROGRESS");
    expect(transition("IN_PROGRESS", "pause")).toBe("PAUSED");
    expect(transition("PAUSED", "resume")).toBe("IN_PROGRESS");
    expect(transition("IN_PROGRESS", "finish")).toBe("COMPLETED");
    expect(() => transition("COMPLETED", "resume")).toThrow();
  });
  it("preserves independently selected candidate input locale", () => {
    expect(validateSpeechConfig({
      interviewerLocale: "en-US", interviewerVoiceId: "en-US-JennyNeural",
      candidateSttLocale: "vi-VN", consentToTranscript: true,
    }).candidateSttLocale).toBe("vi-VN");
    expect(() => validateSpeechConfig({
      interviewerLocale: "vi-VN", interviewerVoiceId: "en-US-JennyNeural",
      candidateSttLocale: "en-US", consentToTranscript: true,
    })).toThrow();
    expect(() => validateSpeechConfig({
      interviewerLocale: "en-US", interviewerVoiceId: "en-US-JennyNeural",
      candidateSttLocale: "en-US", consentToTranscript: false,
    })).toThrow();
  });
  it("returns deterministic fixture prompts", () => {
    expect(getDemoQuestion(0)).toBe(getDemoQuestion(5));
  });
});
