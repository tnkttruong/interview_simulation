import "server-only";
import {eq} from "drizzle-orm";
import {z} from "zod";
import {DomainError,voiceByLocale} from "@interview/core";
import {db} from "./db/client";
import {aiSettings} from "./db/schema";
import {cliAvailable,cliEnabled,cliModels, type CliProvider} from "./ai-cli";

const locale=z.enum(["en-US","en-GB","vi-VN"]);
const model=z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);
export const settingsInput=z.object({
 provider:z.enum(["codex_cli","agy_cli","api_key"]),
 model,
 interviewerLocale:locale,
 candidateSttLocale:locale,
 voiceId:z.string().trim().min(1).max(80)
}).strict();
export type AiSettings=z.infer<typeof settingsInput>;
const providerDefaultModel={codex_cli:"gpt-5.6-sol",agy_cli:"gemini-2.5-flash",api_key:"gpt-4.1-mini"};
export function defaultModel(provider:AiSettings["provider"]){
 return provider==="api_key"?(process.env.AI_MODEL||providerDefaultModel.api_key):providerDefaultModel[provider];
}
function defaultSettings():AiSettings {
 const provider=cliEnabled()?(cliAvailable("codex_cli")?"codex_cli":cliAvailable("agy_cli")?"agy_cli":"api_key"):"api_key";
 return {provider,model:defaultModel(provider),interviewerLocale:"en-US",candidateSttLocale:"en-US",voiceId:voiceByLocale["en-US"][0]};
}
export function readSettings(ownerId:string):AiSettings{
 const saved=db.select().from(aiSettings).where(eq(aiSettings.ownerId,ownerId)).get();
 return saved?settingsInput.parse({provider:saved.provider,model:saved.model,interviewerLocale:saved.interviewerLocale,
  candidateSttLocale:saved.candidateSttLocale,voiceId:saved.voiceId}):defaultSettings();
}
export function saveSettings(ownerId:string,input:unknown):AiSettings{
 const settings=settingsInput.parse(input);
 if(!(voiceByLocale[settings.interviewerLocale] as readonly string[]).includes(settings.voiceId))
  throw new DomainError("invalid","Unsupported default voice");
 db.insert(aiSettings).values({ownerId,...settings,updatedAt:Date.now()}).onConflictDoUpdate({
  target:aiSettings.ownerId,set:{...settings,updatedAt:Date.now()}
 }).run();
 return settings;
}
export function assertReady(ownerId:string):AiSettings{
 const settings=readSettings(ownerId);
 if(settings.provider==="api_key"){
  if(!process.env.OPENAI_API_KEY)throw new DomainError("invalid","Set OPENAI_API_KEY on the server");
 }else if(!cliAvailable(settings.provider)){
  throw new DomainError("invalid","Selected CLI is disabled or not installed on the server");
 }
 return settings;
}
export function settingsCatalog(){
 const status=(provider:CliProvider)=>({available:cliAvailable(provider),models:cliModels(provider)});
 return {
  cliEnabled:cliEnabled(),apiKeyConfigured:!!process.env.OPENAI_API_KEY,
  providers:{
   codex_cli:status("codex_cli"),agy_cli:status("agy_cli"),
   api_key:{available:!!process.env.OPENAI_API_KEY,models:[...new Set([process.env.AI_MODEL||"gpt-4.1-mini","gpt-4.1-mini"])]}
  }
 };
}
