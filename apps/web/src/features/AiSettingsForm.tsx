"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {voiceByLocale} from "@interview/core";
type Locale=keyof typeof voiceByLocale;
type Provider="codex_cli"|"agy_cli"|"api_key";
type Settings={provider:Provider;model:string;interviewerLocale:Locale;candidateSttLocale:Locale;voiceId:string};
type Catalog={cliEnabled:boolean;apiKeyConfigured:boolean;providers:Record<Provider,{available:boolean;models:string[]}>};
const labels:{id:Provider;name:string;description:string}[]=[
 {id:"codex_cli",name:"Codex CLI",description:"Preferred for a local authenticated Codex installation"},
 {id:"agy_cli",name:"Agy CLI",description:"Antigravity CLI, authenticated on this server"},
 {id:"api_key",name:"API key (OpenAI-compatible)",description:"Existing server OPENAI_API_KEY / LLM_BASE_URL"}
];
const languages=[{id:"en-US",name:"English (US)"},{id:"en-GB",name:"English (UK)"},{id:"vi-VN",name:"Tiếng Việt"}];
export default function AiSettingsForm({email}:{email:string}){
 const [form,setForm]=useState<Settings|null>(null);
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{
  fetch("/api/me/ai-settings",{cache:"no-store"}).then(async r=>{
   if(!r.ok)throw Error("Unable to load AI settings");
   return r.json();
  }).then((v:{settings:Settings}&Catalog)=>{setForm(v.settings);setCatalog(v);})
   .catch(e=>setError(String(e)));
 },[]);
 const current=form&&catalog?.providers[form.provider];
 const models=current?.models||[];
 async function save(){
  if(!form)return;setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/me/ai-settings",{method:"PUT",credentials:"same-origin",
    headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
   if(!response.ok)throw Error("Unable to save AI settings (check model and voice)");
   setNotice("Defaults saved for your account. New live interviews will use this AI provider.");
  }catch(e){setError(String(e));}finally{setBusy(false);}
 }
 return <div className="shell">
  <aside className="sidebar">
   <div className="brand">◉ <strong>Interview Simulation</strong></div>
   <div className="side-caption">ACCOUNT SETTINGS</div>
   <nav aria-label="Workspace navigation">
    <Link className="live-entry" href="/live">✦ AI Interview →</Link>
    <Link className="live-entry" href="/">← Offline demo</Link>
   </nav>
   <div className="sidebar-bottom">AI CLI runs on your own server. Install and authenticate it as the server operator.</div>
  </aside>
  <div className="main-area"><header className="topbar"><span className="eyebrow">AI AGENT CONFIGURATION</span><small>{email}</small></header>
   <main className="page"><h1>AI settings</h1>
    <p className="lead">Choose how this account generates interview plans, follow-up questions and hints. Set language defaults for new meetings.</p>
    {error&&<div role="alert" className="alert error">{error}</div>}
    {notice&&<div role="status" className="alert info">{notice}</div>}
    {!form||!catalog?<section className="panel"><p>Loading preferences…</p></section>:<>
     <div className="cols">
      <section className="panel form-grid"><h2>1. AI agent provider</h2>
       <label>Provider
        <select aria-label="AI provider" value={form.provider} onChange={e=>{
         const provider=e.target.value as Provider;
         setForm({...form,provider,model:catalog.providers[provider].models[0]||form.model});
        }}>
         {labels.map(x=><option key={x.id} value={x.id}>{x.name}{!catalog.providers[x.id].available?" (unavailable)":""}</option>)}
        </select>
       </label>
       <p className="muted small">{labels.find(x=>x.id===form.provider)?.description}</p>
       <p className="small">{current?.available?"Detected / enabled on server":"Not available on server. Save is allowed, but live AI calls will fail until configured."}</p>
       <label>AI model
        <input aria-label="AI model" list="ai-model-suggestions" maxLength={100} value={form.model}
         onChange={e=>setForm({...form,model:e.target.value})}/>
        <datalist id="ai-model-suggestions">{models.map(x=><option key={x} value={x}/>)}</datalist>
       </label>
       <p className="muted small">Model suggestions follow the Codex and Agy adapters in auto-dev-workflow. Agy also discovers installed CLI models. You may enter a valid custom model ID.</p>
       <div className="soft-notice">
        {form.provider==="api_key"?"API key remains in server environment; this page never reads or stores your key.":
         "CLI must be installed and logged in under the account running the server. No shell arguments or API secrets are editable from this page."}
       </div>
      </section>
      <section className="panel form-grid"><h2>2. Meeting defaults</h2>
       <label>Default interviewer language
        <select value={form.interviewerLocale} onChange={e=>{
         const next=e.target.value as Locale;
         setForm({...form,interviewerLocale:next,voiceId:voiceByLocale[next][0]});
        }}>{languages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
       </label>
       <label>Default interviewer voice
        <select value={form.voiceId} onChange={e=>setForm({...form,voiceId:e.target.value})}>
         {voiceByLocale[form.interviewerLocale].map(x=><option key={x} value={x}>{x}</option>)}
        </select>
       </label>
       <label>Default candidate speech language
        <select value={form.candidateSttLocale} onChange={e=>setForm({...form,candidateSttLocale:e.target.value as Locale})}>
         {languages.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
       </label>
       <p className="muted small">These are defaults only. You can change the languages and voice for each meeting in preflight.</p>
      </section>
     </div>
     <section className="panel"><h2>3. Provider readiness</h2>
      <p>Codex CLI: <b>{catalog.providers.codex_cli.available?"Installed and enabled":"Unavailable"}</b> · Agy CLI: <b>{catalog.providers.agy_cli.available?"Installed and enabled":"Unavailable"}</b></p>
      <p>API key: <b>{catalog.apiKeyConfigured?"Configured in server environment":"Not configured"}</b></p>
      <p className="muted small">CLI auto-detection checks installation, not authentication. Complete a real scenario smoke test before production use.</p>
      <button className="btn primary" disabled={busy||!form.model.trim()} onClick={save}>{busy?"Saving…":"Save AI settings"}</button>
     </section>
    </>}
   </main>
  </div>
 </div>;
}
