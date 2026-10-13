import "server-only";
import {spawn, spawnSync} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DomainError} from "@interview/core";

export type CliProvider="codex_cli"|"agy_cli";
const commandFor={codex_cli:"codex",agy_cli:"agy"} as const;
const validModel=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/;
export const codexModels=["gpt-5.6-sol","gpt-5.6-terra","gpt-5.6-luna","gpt-5.4","gpt-5.4-mini","gpt-5","o3","o4-mini","gpt-5-mini","gpt-5-nano","o3-mini","codex-mini-latest"];
export const agyFallbackModels=["gemini-2.5-flash","gemini-2.5-pro","gemini-1.5-flash","gemini-1.5-pro","claude-3-5-sonnet","claude-3-5-haiku","gpt-4o","gpt-4o-mini"];

export const cliEnabled=()=>process.env.ENABLE_LOCAL_AI_CLI==="true";
// Do not pass application secrets (database/auth/Azure/API key) to CLI child processes.
function restrictedEnv():NodeJS.ProcessEnv {
 const keys=["PATH","HOME","USER","TMPDIR","LANG","LC_ALL","XDG_CONFIG_HOME","XDG_CACHE_HOME","CODEX_HOME","SystemRoot","APPDATA","LOCALAPPDATA"];
 const env:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV};
 for(const key of keys)if(process.env[key])env[key]=process.env[key];
 return env;
}
const checked=new Map<CliProvider,{time:number,ready:boolean}>();
export function cliAvailable(provider:CliProvider):boolean {
 if(!cliEnabled())return false;
 const cached=checked.get(provider);
 if(cached&&Date.now()-cached.time<30000)return cached.ready;
 const check=spawnSync(commandFor[provider],["--version"],{encoding:"utf8",timeout:2500,maxBuffer:65536,env:restrictedEnv(),windowsHide:true});
 const ready=check.status===0;
 checked.set(provider,{time:Date.now(),ready});
 return ready;
}
let agyCache:{time:number,models:string[]}|null=null;
export function cliModels(provider:CliProvider):string[] {
 if(provider==="codex_cli")return codexModels;
 if(!cliAvailable("agy_cli"))return agyFallbackModels;
 if(agyCache&&Date.now()-agyCache.time<60000)return agyCache.models;
 // Newer Agy exposes machine-readable models; older versions only offer plain text.
 const json=spawnSync("agy",["--output-format","json","models"],{encoding:"utf8",timeout:4000,maxBuffer:524288,env:restrictedEnv(),windowsHide:true});
 let discovered:string[]=[];
 if(json.status===0) {
  try{
   const body=JSON.parse(json.stdout) as {command?:{data?:{models?:{id?:string}[]}}};
   discovered=(body.command?.data?.models||[]).map(x=>x.id||"");
  }catch{/* use text fallback */}
 }
 if(!discovered.length){
  const text=spawnSync("agy",["models"],{encoding:"utf8",timeout:4000,maxBuffer:524288,env:restrictedEnv(),windowsHide:true});
  if(text.status===0)discovered=text.stdout.split(/\r?\n/).map(line=>line.trim().split(/\s+/)[0]||"");
 }
 agyCache={time:Date.now(),models:[...new Set([...discovered.filter(x=>validModel.test(x)),...agyFallbackModels])].slice(0,100)};
 return agyCache.models;
}
function parseResponse(provider:CliProvider,stdout:string):string {
 if(provider==="codex_cli"){
  let answer="";
  for(const line of stdout.split(/\r?\n/)){
   try{
    const event=JSON.parse(line) as {type?:string,item?:{type?:string,text?:string}};
    if(event.type==="item.completed"&&event.item?.type==="agent_message")answer=event.item.text||answer;
   }catch{/* ignore non-JSON diagnostics */}
  }
  return answer.trim();
 }
 let response="";
 for(const line of stdout.split(/\r?\n/)){
  try{
   const event=JSON.parse(line) as {event?:string,result?:{status?:string,response?:string,structured_output?:unknown}};
   if(event.event==="result"&&event.result?.status==="SUCCESS"){
    response=event.result.structured_output?JSON.stringify(event.result.structured_output):event.result.response||"";
   }
  }catch{/* ignore non-JSON diagnostics */}
 }
 return response.trim();
}
export async function runCli(provider:CliProvider,model:string,prompt:string):Promise<string>{
 if(!cliAvailable(provider))throw new DomainError("invalid","CLI provider unavailable on this host");
 if(!validModel.test(model))throw new DomainError("invalid","Invalid model ID");
 const dir=await mkdtemp(join(tmpdir(),"interview-ai-"));
 try {
  const cmd=commandFor[provider];
  const args=provider==="codex_cli"
   ? ["exec","--json","--sandbox","read-only","--skip-git-repo-check","--model",model,"-"]
   : ["--input-format","stream-json","--output-format","stream-json","--sandbox","--model",model];
  return await new Promise<string>((resolve,reject)=>{
   const child=spawn(cmd,args,{cwd:dir,env:restrictedEnv(),shell:false,stdio:["pipe","pipe","pipe"],windowsHide:true});
   let stdout="",stderrBytes=0,finished=false,expired=false;
   const limit=2*1024*1024;
   const timer=setTimeout(()=>{expired=true;child.kill("SIGKILL");},90000);
   child.stdout.on("data",(buffer:Buffer)=>{stdout+=buffer.toString("utf8");if(Buffer.byteLength(stdout)>limit)child.kill("SIGKILL");});
   child.stderr.on("data",(buffer:Buffer)=>{stderrBytes+=buffer.length;if(stderrBytes>limit)child.kill("SIGKILL");});
   child.on("error",()=>{if(!finished){finished=true;clearTimeout(timer);reject(new DomainError("invalid","Unable to launch AI CLI"));}});
   child.on("close",code=>{
    if(finished)return;finished=true;clearTimeout(timer);
    if(expired||code!==0||Buffer.byteLength(stdout)>limit)return reject(new DomainError("invalid","AI CLI invocation failed or timed out"));
    const answer=parseResponse(provider,stdout);
    if(!answer)return reject(new DomainError("invalid","AI CLI produced no structured reply"));
    resolve(answer);
   });
   const payload=provider==="codex_cli"?prompt:JSON.stringify({event:"user",message:{content:prompt}})+"\n";
   child.stdin.on("error",()=>{/* handled by process close */});
   child.stdin.end(payload);
  });
 }finally{await rm(dir,{recursive:true,force:true});}
}
