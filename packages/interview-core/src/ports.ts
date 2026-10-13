import { z } from "zod";

/** Contracts only; real adapters remain P1–P4 work. */
export const scenarioPlanSchema = z.object({
  stages: z.array(z.object({id:z.string(),topic:z.string(),questions:z.array(z.string())})).min(1),
  rubric: z.array(z.object({competency:z.string(),criteria:z.string()})).min(1)
});
export const interviewerTurnSchema = z.object({
  questionId:z.string().min(1),utterance:z.string().min(1),competency:z.string().min(1),promptVersion:z.string().min(1)
});
export const evaluationEvidenceSchema = z.object({
  competency:z.string().min(1),supportingTurnIds:z.array(z.string()),summary:z.string(),confidence:z.number().min(0).max(1)
});
export interface LlmGateway {
  generateStructured<T extends z.ZodTypeAny>(request:{
    schema:T;instruction:string;promptVersion:string;context:readonly {kind:string;text:string}[]
  }):Promise<{output:z.infer<T>;modelId:string;inputTokens:number;outputTokens:number}>;
}
export interface SpeechClient {
  startRecognition(locale:string,onFinal:(text:string)=>void):Promise<void>;
  stopRecognition():Promise<void>;
  speak(text:string,voiceId:string):Promise<void>;
  cancelSpeech():Promise<void>;
}
