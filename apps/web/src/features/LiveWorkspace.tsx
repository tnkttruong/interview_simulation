"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {voiceByLocale} from "@interview/core";
import {checkMicrophone,checkSpeaker,listen,say,type SpeechCredential} from "./azure-client";
import {extractPdf} from "./pdf-client";
type Locale=keyof typeof voiceByLocale;
type Plan={role:string;level:string;overview:string;stages:{topic:string;questions:string[];suggestedAnswers?:string[]}[];rubric:{competency:string;criteria:string}[]};
type Scenario={id:string;role:string;jobDescription:string;focus:string;latestRevision:number;revisions:{revision:number;approvedAt:number|null;notes:string}[]};
type Turn={id:string;sequence:number;question:string;answer:string;answerSource:string;originalStt:string|null};
type Session={id:string;mode:string;state:string;version:number;nextQuestion:string|null;nextQuestionId:string|null;
  nextSuggestedAnswer:string|null;
  turns:Turn[];speechConfig:string};
type Catalog={enabled:boolean;voices:Record<string,string[]>};
const locales:{key:Locale,label:string}[]=[
 {key:"en-US",label:"English (US)"},{key:"en-GB",label:"English (UK)"},{key:"vi-VN",label:"Tiếng Việt"}
];
async function api<T>(url:string,init?:RequestInit):Promise<T>{
 const r=await fetch(url,{credentials:"same-origin",...init,headers:{"Content-Type":"application/json",...init?.headers}});
 const data=await r.json() as T&{error?:string};
 if(!r.ok)throw new Error(data.error||"HTTP "+r.status);
 return data;
}
export default function LiveWorkspace({email}:{email:string}){
 const [step,setStep]=useState<"prepare"|"review"|"preflight"|"meeting"|"results">("prepare");
 const [hydrated,setHydrated]=useState(false);
 const [role,setRole]=useState("Senior Backend Engineer"),[jd,setJd]=useState("");
 const [focus,setFocus]=useState(""),[cvText,setCvText]=useState(""),[cvName,setCvName]=useState("pasted-cv.txt");
 const [scenario,setScenario]=useState<Scenario|null>(null),[plan,setPlan]=useState<Plan|null>(null);
 const [feedback,setFeedback]=useState(""),[candidateLocale,setCandidateLocale]=useState<Locale>("en-US");
 const [interviewerLocale,setInterviewerLocale]=useState<Locale>("en-US");
 const [voice,setVoice]=useState<string>(voiceByLocale["en-US"][0]),[catalog,setCatalog]=useState<Catalog|null>(null);
 const [consent,setConsent]=useState(false),[textOnly,setTextOnly]=useState(false),[micOk,setMicOk]=useState(false);
 const [speakerOk,setSpeakerOk]=useState(false),[session,setSession]=useState<Session|null>(null);
 const [answer,setAnswer]=useState(""),[recognized,setRecognized]=useState(""),[hint,setHint]=useState("");
 const [showSuggestedAnswer,setShowSuggestedAnswer]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [history,setHistory]=useState<{id:string;state:string;mode:string;createdAt:number}[]>([]);
 const startKey=useRef<string|null>(null),answerKey=useRef<string|null>(null);
 const credential=useRef<{value:SpeechCredential;expires:number}|null>(null);
 const visibleVoices=catalog?.enabled?catalog.voices[interviewerLocale]||[]:[...voiceByLocale[interviewerLocale]];
 const approved=!!scenario?.revisions.find(x=>x.revision===scenario.latestRevision)?.approvedAt;
 useEffect(()=>{
  fetch("/api/me/ai-settings",{cache:"no-store"}).then(x=>x.json()).then((d:{settings?:{interviewerLocale:Locale;candidateSttLocale:Locale;voiceId:string}})=>{
   if(d.settings){setInterviewerLocale(d.settings.interviewerLocale);setCandidateLocale(d.settings.candidateSttLocale);setVoice(d.settings.voiceId);}
  }).catch(()=>{}).finally(()=>setHydrated(true));
  fetch("/api/live/speech/voices").then(x=>x.json()).then((d:Catalog)=>{
   if(d.voices)setCatalog(d);
  }).catch(()=>{});
  fetch("/api/demo/sessions?limit=50&mode=live").then(x=>x.json()).then(d=>{
   if(d.items)setHistory(d.items.filter((s:{mode?:string})=>s.mode==="live"));
  }).catch(()=>{});
 },[]);
 async function run(fn:()=>Promise<void>){
  if(busy)return;setBusy(true);setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 async function loadPlan(id:string){
  const details=await api<{scenario:Scenario;plan:Plan}>("/api/live/scenarios/"+id);
  setScenario(details.scenario);setPlan(details.plan);
 }
 function changeLanguage(next:Locale){
  setInterviewerLocale(next);
  setVoice((catalog?.enabled?catalog.voices[next]:undefined)?.[0]||voiceByLocale[next][0]);
  setMicOk(false);
 }
 async function upload(file:File){
  await run(async()=>{
   if(file.size>4*1024*1024)throw new Error("CV limit is 4 MB");
   let content:string;
   if(file.name.toLowerCase().endsWith(".pdf"))content=await extractPdf(file);
   else{
    const data=new FormData();data.append("file",file);
    const result=await fetch("/api/live/cv",{method:"POST",body:data,credentials:"same-origin"});
    const parsed=await result.json();
    if(!result.ok)throw new Error(parsed.error||"CV extraction failed");
    content=parsed.cvText;
   }
   setCvText(content);setCvName(file.name);
   setMessage("Extracted "+content.length+" characters from "+file.name+". Review the text before submitting.");
  });
 }
 async function create(){
  await run(async()=>{
   const generated=await api<Scenario>("/api/live/scenarios",{method:"POST",
    body:JSON.stringify({role,jobDescription:jd,focus,cvText,cvFilename:cvName})});
   await loadPlan(generated.id);setConsent(false);setStep("review");
  });
 }
 async function revise(){
  if(!scenario)return;
  await run(async()=>{
   await api("/api/live/scenarios/"+scenario.id+"/revise",{method:"POST",body:JSON.stringify({feedback,expectedRevision:scenario.latestRevision})});
   await loadPlan(scenario.id);setFeedback("");setConsent(false);
  });
 }
 async function approve(){
  if(!scenario)return;
  await run(async()=>{
   const result=await api<Scenario>("/api/demo/scenarios/"+scenario.id,{
    method:"PATCH",body:JSON.stringify({action:"approve",expectedRevision:scenario.latestRevision})});
   setScenario(result);setConsent(false);setMicOk(false);setSpeakerOk(false);
   setStep("preflight");
  });
 }
 async function getCredential(){
  if(credential.current&&credential.current.expires>Date.now()+30000)return credential.current.value;
  if(!session)throw new Error("Start a session to use speech");
  const data=await api<{token:string;region:string;expiresIn:number}>("/api/live/speech/token",{
   method:"POST",body:JSON.stringify({sessionId:session.id})});
  credential.current={value:{token:data.token,region:data.region},expires:Date.now()+data.expiresIn*1000};
  return credential.current.value;
 }
 async function readQuestion(s:Session){
  const next=await api<Session>("/api/live/sessions/"+s.id+"/question",{method:"POST"});
  setSession(next);setHint("");setShowSuggestedAnswer(false);setRecognized("");setAnswer("");answerKey.current=null;
  return next;
 }
 async function previewSelectedVoice(){
  await run(async()=>{
   const response=await fetch("/api/live/speech/preview",{
    method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({interviewerLocale,voiceId:voice})
   });
   if(!response.ok)throw new Error("Could not preview voice; verify Azure Speech configuration");
   const source=URL.createObjectURL(await response.blob());
   try{
    const sound=new Audio(source);
    await sound.play();
    await new Promise<void>((resolve,reject)=>{
     sound.onended=()=>resolve();sound.onerror=()=>reject(new Error("Audio playback failed"));
    });
    setMessage("Azure voice preview played successfully.");
   }finally{URL.revokeObjectURL(source);}
  });
 }
 async function start(){
  if(!scenario||!approved||!consent)return;
  await run(async()=>{
   if(!textOnly&&(!micOk||!speakerOk))throw new Error("Test mic and speaker, or enable text-only fallback");
   if(!textOnly&&catalog&&!catalog.enabled)throw new Error("Azure not configured; enable text-only fallback");
   if(!visibleVoices.includes(voice))throw new Error("Selected voice unavailable in region");
   if(!startKey.current)startKey.current=crypto.randomUUID();
   const s=await api<Session>("/api/live/sessions",{method:"POST",body:JSON.stringify({
    scenarioId:scenario.id,revision:scenario.latestRevision,requestKey:startKey.current,
    speech:{interviewerLocale,interviewerVoiceId:voice,candidateSttLocale:candidateLocale,consentToTranscript:true}
   })});
   setSession(s);setStep("meeting");startKey.current=null;credential.current=null;
   const q=await readQuestion(s);
   setMessage(q.nextQuestion?"AI interviewer is ready.":"Interview started. Generate the first question.");
  });
 }
 async function refreshSession(id:string){
  const next=await api<Session>("/api/demo/sessions/"+id);
  setSession(next);
  return next;
 }
 async function continueSession(id:string){
  await run(async()=>{
   const selected=await refreshSession(id);
   setShowSuggestedAnswer(false);setHint("");
   const config=JSON.parse(selected.speechConfig);
   setInterviewerLocale(config.interviewerLocale);setCandidateLocale(config.candidateSttLocale);
   setVoice(config.interviewerVoiceId);setTextOnly(true);
   setStep(selected.state==="COMPLETED"?"results":"meeting");
  });
 }
 async function action(kind:"pause"|"resume"|"finish"){
  if(!session)return;
  await run(async()=>{
   const next=await api<Session>("/api/demo/sessions/"+session.id,{method:"PATCH",
    body:JSON.stringify({action:kind,expectedVersion:session.version})});
   setSession(next);setShowSuggestedAnswer(false);
   if(kind==="finish")setStep("results");
  });
 }
 async function submit(){
  if(!session?.nextQuestionId||!answer.trim())return;
  await run(async()=>{
   if(!answerKey.current)answerKey.current=crypto.randomUUID();
   const body={clientTurnId:answerKey.current,expectedTurnSequence:session.turns.length+1,
    expectedQuestionId:session.nextQuestionId,answer:answer.trim(),
    source:recognized?(answer.trim()===recognized?"client_stt":"corrected"):"typed",
    ...(recognized?{originalStt:recognized}:{})};
   try{
    const updated=await api<Session>("/api/demo/sessions/"+session.id+"/turns",{method:"POST",body:JSON.stringify(body)});
    setSession(updated);answerKey.current=null;setHint("");setShowSuggestedAnswer(false);setAnswer("");setRecognized("");
    if(updated.turns.length<15)await readQuestion(updated);
    else setMessage("15-turn limit reached; finish to review the transcript.");
   }catch(e){
    const latest=await refreshSession(session.id);
    if(latest.turns.length>=session.turns.length+1){setAnswer("");answerKey.current=null;}
    throw e;
   }
  });
 }
 async function hintForQuestion(){
  if(!session)return;
  await run(async()=>{
   const result=await api<{hint:string}>("/api/live/sessions/"+session.id+"/hint",{method:"POST"});
   setHint(result.hint);
  });
 }
 async function speak(){
  if(!session?.nextQuestion)return;
  await run(async()=>{
   if(textOnly)throw new Error("Text-only mode active");
   const config=JSON.parse(session.speechConfig);
   await say(session.nextQuestion!,config.interviewerVoiceId,await getCredential());
   setMessage("Interviewer finished speaking. You can answer now.");
  });
 }
 async function record(){
  if(!session)return;
  await run(async()=>{
   if(textOnly)throw new Error("Text-only mode active");
   const config=JSON.parse(session.speechConfig);
   const transcript=await listen(config.candidateSttLocale,await getCredential());
   setRecognized(transcript);setAnswer(transcript);
   setMessage("Speech recognized on this device. Edit the text before confirming if needed.");
  });
 }
 return <div className="shell" data-testid="live-workspace" data-hydrated={hydrated?"true":"false"}>
  <aside className="sidebar"><div className="brand">◉ <strong>Interview Simulation</strong></div>
   <div className="side-caption">AI LIVE · P1–P3</div>
   <nav aria-label="Interview steps">
    {(["prepare","review","preflight","meeting","results"] as const).map((x,i)=>
     <button key={x} className={step===x?"active":""} onClick={()=>setStep(x)}>{i+1}. {x}</button>)}
    <Link href="/settings" style={{color:"white",padding:14}}>⚙ AI Settings</Link>
    <Link href="/" style={{color:"white",padding:14}}>← Offline P0 demo</Link>
   </nav><div className="sidebar-bottom">AI responses require your own model key. Azure speech requires your own Azure resource.</div>
  </aside><div className="main-area">
   <header className="topbar"><span className="eyebrow">LIVE AI MOCK INTERVIEW</span><small>{email}</small></header>
   <main className="page"><h1>Practice a real interview with AI</h1>
    <p className="lead">Scenario from your CV and job description → approval → multilingual voice or typed meeting → adaptive questions and private answer coaching.</p>
    {error&&<div role="alert" className="alert error">{error}</div>}
    {message&&<div role="status" className="alert info">{message}</div>}
    {step==="prepare"&&<div className="cols"><section className="panel form-grid">
     <h2>1. Job & CV</h2>
     <label>Role<input value={role} maxLength={180} onChange={e=>setRole(e.target.value)}/></label>
     <label>Job description<textarea rows={7} value={jd} maxLength={20000} onChange={e=>setJd(e.target.value)}/></label>
     <label>Interview focus (optional)<input value={focus} maxLength={1500} onChange={e=>setFocus(e.target.value)}/></label>
     <label>Upload CV (PDF, DOCX, TXT, MD; ≤4 MB)
      <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/>
     </label>
     <label>Or paste/edit CV text<textarea rows={7} value={cvText} maxLength={30000}
       onChange={e=>{setCvText(e.target.value);setCvName("pasted-cv.txt");}}/></label>
     <button className="btn primary" disabled={busy||jd.trim().length<10||cvText.trim().length<15}
      onClick={create}>Generate AI interview scenario</button>
    </section><section className="panel"><h2>Prior live sessions</h2>
      {history.filter(x=>x.mode==="live").length===0?<p>No previous AI sessions.</p>:
       history.filter(x=>x.mode==="live").map(s=><button key={s.id} className="list-button" disabled={busy}
        onClick={()=>continueSession(s.id)}>{new Date(s.createdAt).toLocaleString()} · {s.state} →</button>)}
     <p className="muted small">PDF text extraction happens in your browser. The extracted CV text is saved on this server for AI planning. Voice audio is processed by Azure but is not saved by this app.</p>
    </section></div>}
    {step==="review"&&<div className="cols"><section className="panel">
      <h2>2. Review scenario · revision {scenario?.latestRevision}</h2>
      {!plan?<p>Generate a scenario first.</p>:<>
       <h3>{plan.role} · {plan.level}</h3><p>{plan.overview}</p>
       {plan.stages.map((s,i)=><div key={i}><h3>{i+1}. {s.topic}</h3>
        <ol>{s.questions.map((q,j)=><li key={j}>{q}
         {s.suggestedAnswers?.[j]&&<details><summary>Suggested answer</summary>
          <p style={{whiteSpace:"pre-wrap"}}>{s.suggestedAnswers[j]}</p></details>}
        </li>)}</ol></div>)}
       <h3>Evaluation rubric</h3><ul>{plan.rubric.map((rub,i)=><li key={i}><b>{rub.competency}:</b> {rub.criteria}</li>)}</ul>
       <button className="btn primary" onClick={approve} disabled={busy||!scenario}>Approve this revision →</button>
      </>}
     </section><section className="panel form-grid"><h2>Ask planner to revise</h2>
       <p>Revisions create a new unapproved version; previously approved versions remain immutable.</p>
       <textarea aria-label="Revision request" rows={5} value={feedback} maxLength={1000}
        onChange={e=>setFeedback(e.target.value)}/>
       <button className="btn secondary" onClick={revise} disabled={busy||!scenario||feedback.trim().length<3}>Revise with AI</button>
      </section></div>}
    {step==="preflight"&&<div className="cols"><section className="panel form-grid">
      <h2>3. Meeting preflight</h2>
      <label>AI interviewer language<select value={interviewerLocale} onChange={e=>changeLanguage(e.target.value as Locale)}>
       {locales.map(l=><option key={l.key} value={l.key}>{l.label}</option>)}</select></label>
      <label>AI interviewer voice<select value={voice} onChange={e=>setVoice(e.target.value)}>
       {visibleVoices.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <button className="btn secondary" type="button" disabled={busy||!catalog?.enabled||!visibleVoices.includes(voice)}
        onClick={previewSelectedVoice}>▶ Preview interviewer voice (Azure)</button>
      <label>Your spoken input language<select value={candidateLocale} onChange={e=>setCandidateLocale(e.target.value as Locale)}>
       {locales.map(l=><option key={l.key} value={l.key}>{l.label}</option>)}</select></label>
      <label className="check"><input type="checkbox" checked={textOnly} onChange={e=>setTextOnly(e.target.checked)}/>
       Use typed answers without Azure speech (microphone tests not required)</label>
      <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
       I explicitly consent to storing my CV, scenario and interview transcript on this server.</label>
      <p className="muted small">Changing interviewer language does not affect candidate STT locale. Audio recording is OFF. Browser microphone needs HTTPS or localhost.</p>
      <button className="btn primary" disabled={busy||!approved||!consent||!visibleVoices.includes(voice)||(!textOnly&&(!micOk||!speakerOk))}
        onClick={start}>Start AI meeting →</button>
     </section><section className="panel"><h2>Device & Azure checks</h2>
       <p>{catalog?.enabled?"Azure Speech configured":"Azure Speech unavailable/not configured; use text-only fallback"}</p>
       <button className="btn secondary" disabled={busy} onClick={()=>run(async()=>{await checkMicrophone();setMicOk(true);setMessage("Microphone permission granted; audio tracks stopped.");})}>
        Test microphone {micOk?"✓":""}</button>
       <button className="btn secondary" disabled={busy} onClick={()=>run(async()=>{await checkSpeaker();setSpeakerOk(true);setMessage("Local speaker tone played.");})}>
        Test speaker {speakerOk?"✓":""}</button>
       <p className="muted small">Voice preview is synthesized by Azure from a fixed sample phrase. Microphone and speaker tests are real hardware checks, not demo passes.</p>
      </section></div>}
    {step==="meeting"&&<div className="meeting-layout"><section>
      <div className="meeting-video"><div className="avatar">👩🏻‍💼</div><strong>AI Interviewer · {session?.state}</strong>
       <p>{session?.nextQuestion||"No current question. Generate or resume the interview."}</p>
      </div>
      <div className="meeting-controls">
       <button className="btn secondary" disabled={busy||!session||session.state!=="IN_PROGRESS"||!!session.nextQuestion}
        onClick={()=>session&&run(async()=>{await readQuestion(session);})}>Generate question</button>
       <button className="btn secondary" disabled={busy||textOnly||!session?.nextQuestion||session?.state!=="IN_PROGRESS"} onClick={speak}>▶ Speak question</button>
       <button className="btn secondary" disabled={busy||textOnly||!session?.nextQuestion||session?.state!=="IN_PROGRESS"} onClick={record}>🎙 Speak answer</button>
       <button className="btn secondary" disabled={!session?.nextSuggestedAnswer||session?.state!=="IN_PROGRESS"}
        aria-pressed={showSuggestedAnswer} onClick={()=>setShowSuggestedAnswer(value=>!value)}>
         {showSuggestedAnswer?"Hide suggested answer":"Show suggested answer"}</button>
       <button className="btn secondary" disabled={busy||!session?.nextQuestion||session?.state!=="IN_PROGRESS"} onClick={hintForQuestion}>💡 Private hint</button>
       {session?.state==="IN_PROGRESS"?<button className="btn secondary" onClick={()=>action("pause")} disabled={busy}>Pause</button>:
        <button className="btn secondary" onClick={()=>action("resume")} disabled={busy||!["PAUSED","INTERRUPTED"].includes(session?.state||"")}>Resume</button>}
       <button className="btn danger" onClick={()=>action("finish")} disabled={busy||!["PAUSED","INTERRUPTED","IN_PROGRESS"].includes(session?.state||"")}>Finish</button>
      </div>
      {showSuggestedAnswer&&session?.nextSuggestedAnswer&&<div className="panel hint" data-testid="suggested-answer">
       <h3>Suggested answer · practice reference</h3>
       <p style={{whiteSpace:"pre-wrap"}}>{session.nextSuggestedAnswer}</p>
       <p className="muted small">Use this as guidance, not as a claim about your own experience.</p>
      </div>}
      {hint&&<div className="panel hint"><h3>Private AI coaching hint</h3><p>{hint}</p><p className="muted small">Hint exposure is logged in workflow evidence.</p></div>
      <div className="panel form-grid"><label>Your answer (speech can be corrected before saving)
       <textarea rows={5} value={answer} maxLength={12000} onChange={e=>{if(!busy){setAnswer(e.target.value);answerKey.current=null;}}}
         disabled={busy||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"}/></label>
       <button className="btn primary" onClick={submit} disabled={busy||!answer.trim()||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"}>✓ Commit answer & next question</button>
       <p className="muted small">Client speech recognition is labelled as unverified client STT. Your original transcript and any edits are preserved separately.</p>
      </div>
     </section><section className="panel transcript"><h2>Interview transcript</h2>
       {(session?.turns||[]).map(t=><div className="turn" key={t.id}><b>Q{t.sequence}</b><p>{t.question}</p>
         <b>Candidate · {t.answerSource}</b><p>{t.answer}</p>{t.originalStt&&t.originalStt!==t.answer&&<small>Original STT: {t.originalStt}</small>}</div>)}
      </section></div>}
    {step==="results"&&<section className="panel">
      <h2>Session complete</h2><p>Recorded answers: {session?.turns.length||0}</p>
      <p>AI scoring and independent audit bundle are planned for P4; they are NOT claimed as completed here.</p>
      {(session?.turns||[]).map(t=><div className="turn" key={t.id}><b>Q{t.sequence}</b><p>{t.question}</p><p>{t.answer}</p></div>)}
      <button className="btn secondary" onClick={()=>{setSession(null);setStep("prepare");}}>New interview</button>
     </section>}
    <div className="panel"><h3>Your data</h3>
     <p className="muted small">Stored CV text, scenarios, interview transcript and evidence can be erased. This deletes both demo and live interviews for your account and cannot be undone.</p>
     <button className="btn danger" disabled={busy} onClick={()=>{if(window.prompt("Type DELETE ALL MY INTERVIEW DATA to permanently delete all your scenarios and sessions")!=="DELETE ALL MY INTERVIEW DATA")return;
       void run(async()=>{await api("/api/me/data",{method:"DELETE",body:JSON.stringify({confirm:"DELETE ALL MY INTERVIEW DATA"})});
         setScenario(null);setPlan(null);setSession(null);setHistory([]);setStep("prepare");setMessage("Your interview data has been deleted.");});}}>
       Delete my interview data</button>
    </div>
    <footer>AI planning (P1) · Azure browser speech (P2) · Adaptive interview and hints (P3) · Evaluation and audit: P4</footer>
   </main></div></div>;
}
