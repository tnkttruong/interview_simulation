import { z } from "zod";

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
    throw new Error("Selected voice does not match interviewer language");
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
  PREFLIGHT: { passPreflight: "READY", cancel: "CANCELED" },
  READY: { start: "IN_PROGRESS", cancel: "CANCELED" },
  IN_PROGRESS: { pause: "PAUSED", connectionLost: "INTERRUPTED", finish: "COMPLETED", cancel: "CANCELED" },
  PAUSED: { resume: "IN_PROGRESS", finish: "COMPLETED", cancel: "CANCELED" },
  INTERRUPTED: { resume: "IN_PROGRESS", finish: "COMPLETED", cancel: "CANCELED" },
  COMPLETED: { beginEvaluation: "EVALUATING" },
  EVALUATING: { evaluationSucceeded: "EVALUATED" }
};
export function transition(current: SessionState, action: string): SessionState {
  const next = transitionRules[current]?.[action];
  if (!next) throw new Error(`Invalid session transition: ${current} -> ${action}`);
  return next;
}
export const demoQuestions = [
  "Can you introduce yourself and describe a relevant project?",
  "Describe a difficult production incident and how you investigated it.",
  "How would you design a reliable service for this role?",
  "What trade-offs would you consider when scaling the database?",
  "What would you improve if you had another month on your last project?"
] as const;
export function getDemoQuestion(index: number): string {
  return demoQuestions[index % demoQuestions.length]!;
}
