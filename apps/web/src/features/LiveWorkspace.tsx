"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {voiceByLocale} from "@interview/core";
import {listen,say,type SpeechCredential} from "./azure-client";
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
 const [step,setStep]=useState<"setup"|"meeting"|"results">("setup");
 const [hydrated,setHydrated]=useState(false);
 const [role,setRole]=useState(""),[jd,setJd]=useState("");
 const [focus,setFocus]=useState(""),[cvText,setCvText]=useState(""),[cvName,setCvName]=useState("pasted-cv.txt");
 const [scenario,setScenario]=useState<Scenario|null>(null),[plan,setPlan]=useState<Plan|null>(null);
 const [feedback,setFeedback]=useState(""),[candidateLocale,setCandidateLocale]=useState<Locale>("en-US");
 const [interviewerLocale,setInterviewerLocale]=useState<Locale>("en-US");
 const [voice,setVoice]=useState<string>(voiceByLocale["en-US"][0]),[catalog,setCatalog]=useState<Catalog|null>(null);
 const [consent,setConsent]=useState(false),[voiceMode,setVoiceMode]=useState<"auto"|"typed"|"voice">("auto");
 const [session,setSession]=useState<Session|null>(null);
 const [generatedKey,setGeneratedKey]=useState<string|null>(null);
 const [answer,setAnswer]=useState(""),[recognized,setRecognized]=useState(""),[hint,setHint]=useState("");
 const [showSuggestedAnswer,setShowSuggestedAnswer]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [history,setHistory]=useState<{id:string;state:string;mode:string;createdAt:number}[]>([]);
 const startKey=useRef<string|null>(null),answerKey=useRef<string|null>(null);
 const credential=useRef<{value:SpeechCredential;expires:number}|null>(null);
 const visibleVoices=catalog?.enabled?catalog.voices[interviewerLocale]||[]:[...voiceByLocale[interviewerLocale]];
 const approved=!!scenario?.revisions.find(x=>x.revision===scenario.latestRevision)?.approvedAt;
 const inputKey=JSON.stringify({role,jd,focus,cvText,cvName});
 const planCurrent=!!scenario&&!!plan&&generatedKey===inputKey;
 const questionCount=plan?.stages.reduce((total,stage)=>total+stage.questions.length,0)??0;
 const textOnly=voiceMode==="typed"||(voiceMode==="auto"&&(!catalog?.enabled||!visibleVoices.includes(voice)));
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
    body:JSON.stringify({role:role.trim()||"Position specified in job description",jobDescription:jd,focus,cvText,cvFilename:cvName})});
   await loadPlan(generated.id);setGeneratedKey(inputKey);setConsent(false);
   setMessage("Interview script is ready. Review it below or start the meeting.");
  });
 }
 async function revise(){
  if(!scenario)return;
  await run(async()=>{
   await api("/api/live/scenarios/"+scenario.id+"/revise",{method:"POST",body:JSON.stringify({feedback,expectedRevision:scenario.latestRevision})});
   await loadPlan(scenario.id);setFeedback("");setConsent(false);
   setMessage("Interview script updated. You can start the meeting.");
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
  if(!scenario||!planCurrent||!consent)return;
  await run(async()=>{
   if(voiceMode==="voice"&&!catalog?.enabled)throw new Error("Azure Speech is unavailable. Select automatic or typed mode.");
   if(!textOnly&&!visibleVoices.includes(voice))throw new Error("Selected voice is unavailable in this Azure region");
   // Approval is still recorded on the server, but no extra approval screen is needed.
   if(!approved){
    const updated=await api<Scenario>("/api/demo/scenarios/"+scenario.id,{
     method:"PATCH",body:JSON.stringify({action:"approve",expectedRevision:scenario.latestRevision})});
    setScenario(updated);
   }
   if(!startKey.current)startKey.current=crypto.randomUUID();
   const started=await api<Session>("/api/live/sessions",{method:"POST",body:JSON.stringify({
    scenarioId:scenario.id,revision:scenario.latestRevision,requestKey:startKey.current,
    speech:{interviewerLocale,interviewerVoiceId:voice,candidateSttLocale:candidateLocale,consentToTranscript:true}
   })});
   setSession(started);setStep("meeting");startKey.current=null;credential.current=null;
   setHistory(previous=>[{id:started.id,mode:started.mode,state:started.state,createdAt:Date.now()},
    ...previous.filter(item=>item.id!==started.id)]);
   const next=await readQuestion(started);
   setMessage(next.nextQuestion?"Your AI interviewer is ready.":"Interview started. Select Generate question to retry.");
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
   setVoice(config.interviewerVoiceId);setVoiceMode("typed");
   setStep(selected.state==="COMPLETED"?"results":"meeting");
  });
 }
 async function action(kind:"pause"|"resume"|"finish"){
  if(!session)return;
  await run(async()=>{
   const next=await api<Session>("/api/demo/sessions/"+session.id,{method:"PATCH",
    body:JSON.stringify({action:kind,expectedVersion:session.version})});
   setSession(next);setShowSuggestedAnswer(false);
   setHistory(previous=>previous.map(item=>item.id===next.id?{...item,state:next.state}:item));
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
 return <div className="live-simple-shell" data-testid="live-workspace" data-hydrated={hydrated?"true":"false"}>
  <header className="live-simple-topbar">
   <strong>◉ Interview Simulation</strong>
   <nav aria-label="App navigation">
    <Link href="/settings">AI Settings</Link>
    <small>{email}</small>
   </nav>
  </header>
  <main className="live-simple-main">
   {step==="setup"&&<>
    <div className="live-simple-heading">
     <span className="eyebrow">AI MOCK INTERVIEW</span>
     <h1>Practice a real interview with AI</h1>
     <p className="lead">Add a job description and your CV, generate an interview script, then start the meeting.</p>
    </div>
   </>}
   {step==="meeting"&&<div className="live-simple-heading">
    <span className="eyebrow">LIVE MEETING</span>
    <h1>Interview in progress</h1>
   </div>}
   {step==="results"&&<div className="live-simple-heading">
    <span className="eyebrow">INTERVIEW COMPLETE</span>
    <h1>Interview summary</h1>
   </div>}
   {error&&<div role="alert" className="alert error">{error}</div>}
   {message&&<div role="status" className="alert info">{message}</div>}
   {step==="setup"&&<>
    <section className="panel live-form">
     <h2>Job description & CV</h2>
     <div className="live-inputs">
      <label>Job description
       <textarea rows={10} value={jd} maxLength={20000} placeholder="Paste the job description here..."
        onChange={e=>setJd(e.target.value)}/>
      </label>
      <div className="live-cv-input">
       <label>Upload CV (PDF, DOCX, TXT, MD; ≤4 MB)
        <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy}
         onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/>
       </label>
       <p className="muted small">Or paste your CV below. You can edit the extracted text.</p>
       <label>Or paste/edit CV text
        <textarea rows={7} value={cvText} maxLength={30000} placeholder="Paste your experience, skills and projects..."
         onChange={e=>{setCvText(e.target.value);setCvName("pasted-cv.txt");}}/>
       </label>
      </div>
     </div>
     <details className="live-details">
      <summary>Optional: role and interview focus</summary>
      <div className="live-extra-fields">
       <label>Role (optional)<input value={role} maxLength={180} placeholder="AI will infer from JD"
        onChange={e=>setRole(e.target.value)}/></label>
       <label>Interview focus (optional)<input value={focus} maxLength={1500}
        placeholder="Example: backend architecture and incident response" onChange={e=>setFocus(e.target.value)}/></label>
      </div>
     </details>
     <div className="live-action-row">
      <button className="btn primary" disabled={busy||jd.trim().length<10||cvText.trim().length<15}
       onClick={create}>{busy?"Working...":"Generate AI interview scenario"}</button>
      <span className="muted small">JD and CV are stored on this server when you generate a script.</span>
     </div>
    </section>
    {planCurrent&&plan&&<section className="panel live-script" data-testid="generated-script">
     <div className="live-script-heading">
      <div><span className="eyebrow">READY TO PRACTICE</span><h2>{plan.role} · {plan.level}</h2></div>
      <span className="pill">{questionCount} planned questions</span>
     </div>
     <p>{plan.overview}</p>
     <label className="check">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
      I explicitly consent to storing my CV, interview scenario and transcript on this server.
     </label>
     <div className="live-action-row">
      <button className="btn primary live-main-cta" disabled={busy||!consent} onClick={start}>▶ Start AI meeting</button>
      <span className="muted small">{textOnly?"Typed answers · no Azure setup required":"Voice enabled · microphone access requested when recording"}</span>
     </div>
     <details className="live-details">
      <summary>View interview questions & suggested answers</summary>
      {plan.stages.map((stage,i)=><div className="live-stage" key={i}>
       <h3>{i+1}. {stage.topic}</h3>
       <ol>{stage.questions.map((question,j)=><li key={j}>{question}
        {stage.suggestedAnswers?.[j]&&<details className="live-answer-details">
         <summary>Suggested answer</summary>
         <p style={{whiteSpace:"pre-wrap"}}>{stage.suggestedAnswers[j]}</p>
        </details>}</li>)}</ol>
      </div>)}
     </details>
     <details className="live-details">
      <summary>Refine script with AI (optional)</summary>
      <div className="live-extra-fields">
       <label>Revision request
        <textarea rows={3} value={feedback} maxLength={1000}
         placeholder="Example: Ask more architecture questions"
         onChange={e=>setFeedback(e.target.value)}/>
       </label>
       <button className="btn secondary" onClick={revise} disabled={busy||feedback.trim().length<3}>Revise with AI</button>
      </div>
     </details>
     <details className="live-details">
      <summary>Meeting preferences (optional)</summary>
      <div className="live-extra-fields">
       <label>AI interviewer language
        <select value={interviewerLocale} onChange={e=>changeLanguage(e.target.value as Locale)}>
         {locales.map(locale=><option key={locale.key} value={locale.key}>{locale.label}</option>)}
        </select>
       </label>
       <label>Answer input mode
        <select value={voiceMode} onChange={e=>setVoiceMode(e.target.value as "auto"|"typed"|"voice")}>
         <option value="auto">Automatic (voice when configured, otherwise typed)</option>
         <option value="typed">Typed answers</option>
         <option value="voice" disabled={!catalog?.enabled}>Azure microphone and voice</option>
        </select>
       </label>
       {!textOnly&&<>
        <label>AI interviewer voice<select value={voice} onChange={e=>setVoice(e.target.value)}>
         {visibleVoices.map(name=><option key={name} value={name}>{name}</option>)}
        </select></label>
        <label>Your spoken input language<select value={candidateLocale}
         onChange={e=>setCandidateLocale(e.target.value as Locale)}>
         {locales.map(locale=><option key={locale.key} value={locale.key}>{locale.label}</option>)}
        </select></label>
        <button type="button" className="btn secondary" disabled={busy||!catalog?.enabled}
         onClick={previewSelectedVoice}>▶ Preview voice</button>
       </>}
       <p className="muted small">{catalog?.enabled?"Azure Speech is configured.":"Azure Speech is not configured; typed answers work without microphone setup."}</p>
      </div>
     </details>
    </section>}
    {!!plan&&!planCurrent&&<div role="status" className="alert info">
     Your JD or CV changed. Generate an updated script before starting.
    </div>}
    <details className="panel live-history">
     <summary>Previous interviews ({history.filter(item=>item.mode==="live").length})</summary>
     {history.filter(item=>item.mode==="live").length===0?<p className="muted">No previous sessions yet.</p>:
      history.filter(item=>item.mode==="live").map(item=><button className="list-button" key={item.id}
       disabled={busy} onClick={()=>continueSession(item.id)}>
       {new Date(item.createdAt).toLocaleString()} · {item.state} →</button>)}
    </details>
   </>}
   {step==="meeting"&&<section className="live-meeting">
    <div className="live-meeting-heading">
     <strong>Question {Math.min((session?.turns.length||0)+1,15)} / 15</strong>
     <button className="btn danger" disabled={busy||!session||!["IN_PROGRESS","PAUSED","INTERRUPTED"].includes(session.state)}
      onClick={()=>action("finish")}>Finish interview</button>
    </div>
    <div className="meeting-video">
     <div className="avatar">👩🏻‍💼</div>
     <strong>AI Interviewer · {session?.state}</strong>
     <p>{session?.nextQuestion||"No active question. Resume or generate the next question."}</p>
    </div>
    <div className="live-meeting-tools">
     {!session?.nextQuestion&&session?.state==="IN_PROGRESS"&&
      <button className="btn secondary" disabled={busy} onClick={()=>session&&run(async()=>{await readQuestion(session);})}>
       Generate question</button>}
     {!textOnly&&session?.state==="IN_PROGRESS"&&<>
      <button className="btn secondary" disabled={busy||!session?.nextQuestion} onClick={speak}>▶ Listen</button>
      <button className="btn secondary" disabled={busy||!session?.nextQuestion} onClick={record}>🎙 Speak answer</button>
     </>}
     <button className="btn secondary" disabled={!session?.nextSuggestedAnswer||session?.state!=="IN_PROGRESS"}
      aria-pressed={showSuggestedAnswer} onClick={()=>setShowSuggestedAnswer(value=>!value)}>
      {showSuggestedAnswer?"Hide suggested answer":"Show suggested answer"}</button>
     <button className="btn secondary" disabled={busy||!session?.nextQuestion||session?.state!=="IN_PROGRESS"}
      onClick={hintForQuestion}>💡 Private hint</button>
     <details className="live-controls-more">
      <summary>More meeting controls</summary>
      {session?.state==="IN_PROGRESS"?<button className="btn secondary" disabled={busy}
       onClick={()=>action("pause")}>Pause</button>:
       <button className="btn secondary" disabled={busy||!["PAUSED","INTERRUPTED"].includes(session?.state||"")}
        onClick={()=>action("resume")}>Resume</button>}
     </details>
    </div>
    {showSuggestedAnswer&&session?.nextSuggestedAnswer&&<div className="panel hint" data-testid="suggested-answer">
     <h3>Suggested answer · practice reference</h3>
     <p style={{whiteSpace:"pre-wrap"}}>{session.nextSuggestedAnswer}</p>
     <p className="muted small">Use it as a guide, not a claim about your experience.</p>
    </div>}
    {hint&&<div className="panel hint"><h3>Private AI coaching hint</h3><p>{hint}</p></div>}
    <div className="panel form-grid">
     <label>Your answer (speech can be corrected before saving)
      <textarea rows={5} value={answer} maxLength={12000}
       placeholder="Type your answer or use the microphone..."
       onChange={e=>{if(!busy){setAnswer(e.target.value);answerKey.current=null;}}}
       disabled={busy||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"}/>
     </label>
     <button className="btn primary" onClick={submit}
      disabled={busy||!answer.trim()||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"}>
      ✓ Commit answer & next question</button>
    </div>
    <details className="panel live-history">
     <summary>Interview transcript ({session?.turns.length||0} answers)</summary>
     {(session?.turns||[]).map(turn=><div className="turn" key={turn.id}>
      <b>Q{turn.sequence}</b><p>{turn.question}</p><b>Candidate</b><p>{turn.answer}</p>
      {turn.originalStt&&turn.originalStt!==turn.answer&&<small>Original STT: {turn.originalStt}</small>}
     </div>)}
    </details>
   </section>}
   {step==="results"&&<section className="panel">
    <h2>Session complete</h2><p>Recorded answers: {session?.turns.length||0}</p>
    <p className="muted">AI evaluation and independent audit are planned for a later phase.</p>
    <details className="live-details"><summary>Review your interview transcript</summary>
     {(session?.turns||[]).map(turn=><div className="turn" key={turn.id}>
      <b>Q{turn.sequence}</b><p>{turn.question}</p><p>{turn.answer}</p>
     </div>)}
    </details>
    <button className="btn primary" onClick={()=>{setSession(null);setStep("setup");setMessage("");}}>
     New interview</button>
   </section>}
   <details className="panel live-privacy">
    <summary>Privacy & data</summary>
    <p className="muted small">Delete stored CV text, interview scenarios, transcripts, and evidence for this account. This also removes offline demo sessions.</p>
    <button className="btn danger" disabled={busy} onClick={()=>{
     if(window.prompt("Type DELETE ALL MY INTERVIEW DATA to permanently delete all your scenarios and sessions")!=="DELETE ALL MY INTERVIEW DATA")return;
     void run(async()=>{await api("/api/me/data",{method:"DELETE",body:JSON.stringify({confirm:"DELETE ALL MY INTERVIEW DATA"})});
      setScenario(null);setPlan(null);setGeneratedKey(null);setSession(null);setHistory([]);setConsent(false);setStep("setup");
      setMessage("Your interview data has been deleted.");});
    }}>Delete my interview data</button>
   </details>
  </main>
 </div>;
}
