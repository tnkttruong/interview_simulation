import { z } from "zod";
import { DomainError } from "./errors";
export * from "./ports";
export * from "./errors";
export * from "./flow";

export const supportedLocales = ["en-US", "en-GB", "vi-VN"] as const;
export const voiceByLocale = {
  "en-US": ["en-US-JennyNeural", "en-US-GuyNeural"],
  "en-GB": ["en-GB-SoniaNeural", "en-GB-RyanNeural"],
  "vi-VN": ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"]
} as const;

export const speechConfigSchema = z.object({
  interviewerLocale: z.enum(supportedLocales),
  interviewerVoiceId: z.string().min(1),
  candidateSttLocale: z.enum(supportedLocales),
  consentToTranscript: z.literal(true),
});
export type SpeechConfig = z.infer<typeof speechConfigSchema>;

export function validateSpeechConfig(input: unknown): SpeechConfig {
  const config = speechConfigSchema.parse(input);
  const voices: readonly string[] = voiceByLocale[config.interviewerLocale];
  if (!voices.includes(config.interviewerVoiceId)) {
    throw new DomainError("invalid", "Selected voice does not match interviewer language");
  }
  return config;
}

export const sessionStates = [
  "CREATED", "PREFLIGHT", "READY", "IN_PROGRESS", "PAUSED",
  "INTERRUPTED", "COMPLETED", "EVALUATING", "EVALUATED", "FAILED", "CANCELED"
] as const;
export type SessionState = typeof sessionStates[number];

const transitionRules: Partial<Record<SessionState, Record<string, SessionState>>> = {
  CREATED: { enterPreflight: "PREFLIGHT", cancel: "CANCELED" },
  PREFLIGHT: { passPreflight: "READY", skipDemoPreflight: "READY", cancel: "CANCELED" },
  READY: { start: "IN_PROGRESS", cancel: "CANCELED" },
  IN_PROGRESS: { pause: "PAUSED", connectionLost: "INTERRUPTED", finish: "COMPLETED", cancel: "CANCELED" },
  PAUSED: { resume: "IN_PROGRESS", finish: "COMPLETED", cancel: "CANCELED" },
  INTERRUPTED: { resume: "IN_PROGRESS", finish: "COMPLETED", cancel: "CANCELED" },
  COMPLETED: { beginEvaluation: "EVALUATING" },
  EVALUATING: { evaluationSucceeded: "EVALUATED" }
};
export function transition(current: SessionState, action: string): SessionState {
  const next = transitionRules[current]?.[action];
  if (!next) throw new DomainError("transition", `Invalid session transition: ${current} -> ${action}`);
  return next;
}
export const demoQuestions = [
  "Can you introduce yourself and describe a relevant project?",
  "Describe a difficult production incident and how you investigated it.",
  "How would you design a reliable service for this role?",
  "What trade-offs would you consider when scaling the database?",
  "What would you improve if you had another month on your last project?"
] as const;
export const maxDemoTurns = 15;

const demoQuestionsVi = [
  "Bạn có thể giới thiệu bản thân và mô tả một dự án liên quan không?",
  "Hãy kể về một sự cố khó trong môi trường production và cách bạn điều tra.",
  "Bạn sẽ thiết kế một dịch vụ đáng tin cậy cho vị trí này như thế nào?",
  "Bạn sẽ cân nhắc những đánh đổi nào khi mở rộng cơ sở dữ liệu?",
  "Nếu có thêm một tháng cho dự án gần đây nhất, bạn sẽ cải thiện điều gì?"
] as const;

/** P0 uses deterministic localized text fixtures, not live AI or speech. */
export function getDemoQuestion(index: number, locale: typeof supportedLocales[number] = "en-US"): string {
  const catalog: readonly string[] = locale === "vi-VN" ? demoQuestionsVi : demoQuestions;
  return catalog[index % catalog.length]!;
}
