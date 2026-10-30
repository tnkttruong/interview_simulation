"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {voiceByLocale} from "@interview/core";
import {checkMicrophone,checkSpeaker,say,startContinuousListening,type ContinuousListener,type SpeechCredential} from "./azure-client";
import {extractPdf} from "./pdf-client";
type Locale=keyof typeof voiceByLocale;
const VALID_STEPS=["prepare","review","preflight","meeting","results"] as const;
type Step=typeof VALID_STEPS[number];
type PlannedItem={type:"standalone"|"interactive";prompt:string;goal:string;maxFollowUps:number;completionCriteria:string;suggestedAnswer:string};
type Plan={role:string;level:string;overview:string;stages:{topic:string;questions:string[];suggestedAnswers?:string[];items?:PlannedItem[]}[];rubric:{competency:string;criteria:string}[]};
type Scenario={id:string;role:string;jobDescription:string;focus:string;latestRevision:number;revisions:{revision:number;approvedAt:number|null;notes:string}[]};
type Turn={id:string;sequence:number;question:string;answer:string;answerSource:string;originalStt:string|null};
type Session={id:string;scenarioId?:string;mode:string;state:string;version:number;nextQuestion:string|null;nextQuestionId:string|null;
  nextSuggestedAnswer?:string|null;nextQuestionType?:string|null;nextScenarioTitle?:string|null;
  nextScenarioGoal?:string|null;nextFollowUpDepth?:number;nextFollowUpLimit?:number;
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
 const [step,setStep]=useState<Step>("prepare");

 const changeStep=useCallback((next:Step,replace:boolean=false,scenarioIdOverride?:string,sessionIdOverride?:string)=>{
  setStep(next);
  if(typeof window!=="undefined"){
   const url=new URL(window.location.href);
   url.searchParams.set("step",next);
   const scId=scenarioIdOverride!==undefined?scenarioIdOverride:scenarioRef.current?.id;
   if(scId){
    url.searchParams.set("scenarioId",scId);
   }else{
    url.searchParams.delete("scenarioId");
   }
   const sessId=sessionIdOverride!==undefined?sessionIdOverride:sessionRef.current?.id;
   if(sessId&&(next==="meeting"||next==="results")){
    url.searchParams.set("sessionId",sessId);
   }else if(next==="prepare"||next==="review"||next==="preflight"){
    url.searchParams.delete("sessionId");
   }
   const targetUrl=url.pathname+(url.search?url.search:"");
   if(replace){
    window.history.replaceState({step:next},"",targetUrl);
   }else{
    window.history.pushState({step:next},"",targetUrl);
   }
  }
 },[]);
 const [hydrated,setHydrated]=useState(false);
 const [role,setRole]=useState("Senior Backend Engineer"),[jd,setJd]=useState("");
 const [focus,setFocus]=useState(""),[cvText,setCvText]=useState(""),[cvName,setCvName]=useState("pasted-cv.txt");
 const [scenario,setScenario]=useState<Scenario|null>(null),[plan,setPlan]=useState<Plan|null>(null);
 const [feedback,setFeedback]=useState(""),[candidateLocale,setCandidateLocale]=useState<Locale>("en-US");
 const [isEditing,setIsEditing]=useState(false);
 const [editRole,setEditRole]=useState(""),[editJd,setEditJd]=useState("");
 const [editFocus,setEditFocus]=useState(""),[editCvText,setEditCvText]=useState("");
 const [interviewerLocale,setInterviewerLocale]=useState<Locale>("en-US");
 const [voice,setVoice]=useState<string>(voiceByLocale["en-US"][0]),[catalog,setCatalog]=useState<Catalog|null>(null);
 const [consent,setConsent]=useState(false),[textOnly,setTextOnly]=useState(false),[micOk,setMicOk]=useState(false);
 const [speakerOk,setSpeakerOk]=useState(false),[session,setSession]=useState<Session|null>(null);
 const [isRecording,setIsRecording]=useState(false);
 const [interimText,setInterimText]=useState("");
 const [answer,setAnswer]=useState(""),[recognized,setRecognized]=useState(""),[hint,setHint]=useState("");
 const [showSuggestedAnswer,setShowSuggestedAnswer]=useState(false);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [history,setHistory]=useState<{id:string;state:string;mode:string;createdAt:number}[]>([]);
 const startKey=useRef<string|null>(null),answerKey=useRef<string|null>(null);
 const credential=useRef<{value:SpeechCredential;expires:number}|null>(null);
 const visibleVoices=catalog?.enabled?catalog.voices[interviewerLocale]||[]:[...voiceByLocale[interviewerLocale]];
 const approved=!!scenario?.revisions.find(x=>x.revision===scenario.latestRevision)?.approvedAt;

 const scenarioRef=useRef<Scenario|null>(scenario);
 scenarioRef.current=scenario;
 const sessionRef=useRef<Session|null>(session);
 sessionRef.current=session;
 const preparingQuestionRef=useRef(false);
 const lastSpokenQuestionIdRef=useRef<string|null>(null);
 const isRecordingRef=useRef(false);
 const listenerRef=useRef<ContinuousListener|null>(null);

 useEffect(()=>{
  if(step==="meeting"&&!micOk&&!textOnly&&typeof window!=="undefined"){
   checkMicrophone().then(()=>{
    setMicOk(true);
   }).catch(e=>{
    console.warn("Microphone permission not granted yet:", e);
   });
  }
 },[step,micOk,textOnly]);

 useEffect(()=>{
  if(typeof window!=="undefined"&&scenario?.id){
   sessionStorage.setItem("last_scenario_id",scenario.id);
  }
 },[scenario]);

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

 const loadPlan=useCallback(async(id:string)=>{
  const details=await api<{scenario:Scenario;plan:Plan|null;cvFilename?:string;cvText?:string}>("/api/live/scenarios/"+id);
  setScenario(details.scenario);scenarioRef.current=details.scenario;setPlan(details.plan);
  if(details.cvText)setCvText(details.cvText);
  if(details.cvFilename)setCvName(details.cvFilename);
  setEditRole(details.scenario.role);
  setEditJd(details.scenario.jobDescription);
  setEditFocus(details.scenario.focus);
  setEditCvText(details.cvText||"");
 },[]);

 const loadSessionById=useCallback(async(id:string)=>{
  const next=await api<Session>("/api/demo/sessions/"+id);
  setSession(next);
  sessionRef.current=next;
  try{
   const config=JSON.parse(next.speechConfig);
   if(config.interviewerLocale)setInterviewerLocale(config.interviewerLocale);
   if(config.candidateSttLocale)setCandidateLocale(config.candidateSttLocale);
   if(config.interviewerVoiceId)setVoice(config.interviewerVoiceId);
  }catch{}
  if(next.scenarioId&&scenarioRef.current?.id!==next.scenarioId){
   try{await loadPlan(next.scenarioId);}catch(e){console.error("Failed to load scenario plan:", e);}
  }
  return next;
 },[loadPlan]);

 useEffect(()=>{
  const syncFromUrl=async ()=>{
   const params=new URLSearchParams(window.location.search);
   const s=params.get("step");
   const sessId=params.get("sessionId");
   let currentSession=sessionRef.current;
   if(sessId&&currentSession?.id!==sessId){
    try{
     currentSession=await loadSessionById(sessId);
     if(currentSession.state==="IN_PROGRESS"&&!currentSession.nextQuestion&&!preparingQuestionRef.current){
      preparingQuestionRef.current=true;
      try{
       currentSession=await readQuestion(currentSession);
      }catch(e){
       console.error("Failed to prepare initial question:", e);
      }finally{
       preparingQuestionRef.current=false;
      }
     }
     if(currentSession?.nextQuestion&&currentSession.nextQuestionId&&lastSpokenQuestionIdRef.current!==currentSession.nextQuestionId){
      lastSpokenQuestionIdRef.current=currentSession.nextQuestionId;
      void speak(currentSession,true);
     }
    }catch(e){
     console.error("Failed to load session in live workspace:", e);
    }
   }

   if(currentSession){
    const targetStep=currentSession.state==="COMPLETED"?"results":"meeting";
    setStep(targetStep);
    if(typeof window!=="undefined"&&(s!==targetStep||!sessId)){
     const url=new URL(window.location.href);
     url.searchParams.set("step",targetStep);
     url.searchParams.set("sessionId",currentSession.id);
     if(currentSession.scenarioId)url.searchParams.set("scenarioId",currentSession.scenarioId);
     window.history.replaceState({step:targetStep},"",url.pathname+(url.search?url.search:""));
    }
   }else{
    let scId=params.get("scenarioId");
    if(!scId&&typeof window!=="undefined"&&(s==="preflight"||s==="review")){
     const stored=sessionStorage.getItem("last_scenario_id");
     if(stored)scId=stored;
    }
    if(scId&&scenarioRef.current?.id!==scId){
     try{
      await loadPlan(scId);
     }catch(e){
      console.error("Failed to load scenario in live workspace:", e);
     }
    }
    if(s&&(VALID_STEPS as readonly string[]).includes(s)){
     if(s==="meeting"||s==="results"){
      setStep("prepare");
      const url=new URL(window.location.href);
      url.searchParams.delete("step");
      url.searchParams.delete("sessionId");
      window.history.replaceState({step:"prepare"},"",url.pathname+(url.search?url.search:""));
     }else{
      setStep(s as Step);
     }
    }else{
     setStep("prepare");
    }
   }
  };
  void syncFromUrl();
  window.addEventListener("popstate",syncFromUrl);
  return ()=>{
   if(listenerRef.current){
    void listenerRef.current.stop();
    listenerRef.current=null;
   }
   window.removeEventListener("popstate",syncFromUrl);
  };
 },[loadPlan,loadSessionById]);
 async function run(fn:()=>Promise<void>){
  if(busy)return;setBusy(true);setError("");
  try{await fn();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 function changeLanguage(next:Locale){
  setInterviewerLocale(next);
  setVoice((catalog?.enabled?catalog.voices[next]:undefined)?.[0]||voiceByLocale[next][0]);
  setMicOk(false);
 }
 async function upload(file:File, target: "cv" | "jd" = "cv"){
  await run(async()=>{
   if(file.size>4*1024*1024)throw new Error("File limit is 4 MB");
   let content:string;
   if(file.name.toLowerCase().endsWith(".pdf"))content=await extractPdf(file);
   else{
    const data=new FormData();data.append("file",file);
    const result=await fetch("/api/live/cv",{method:"POST",body:data,credentials:"same-origin"});
    const parsed=await result.json();
    if(!result.ok)throw new Error(parsed.error||"File extraction failed");
    content=parsed.cvText;
   }
   if(target==="cv"){
    setCvText(content);setCvName(file.name);setEditCvText(content);
    setMessage("Extracted "+content.length+" characters from "+file.name+" into CV. Review the text before submitting.");
   }else{
    setJd(content);setEditJd(content);
    setMessage("Extracted "+content.length+" characters from "+file.name+" into Job Description. Review the text before submitting.");
   }
  });
 }
 async function create(){
  await run(async()=>{
   const generated=await api<Scenario>("/api/live/scenarios",{method:"POST",
    body:JSON.stringify({role,jobDescription:jd,focus,cvText,cvFilename:cvName,planImmediately:false})});
   await loadPlan(generated.id);setConsent(false);setIsEditing(false);changeStep("review");
   setMessage("Scenario created! You can update details or start planning the interview review meeting script.");
  });
 }
 async function saveScenarioUpdate(){
  if(!scenario)return;
  await run(async()=>{
   const updated=await api<{scenario:Scenario;plan:Plan|null;cvFilename?:string;cvText?:string}>("/api/live/scenarios/"+scenario.id,{
    method:"PATCH",
    body:JSON.stringify({role:editRole,jobDescription:editJd,focus:editFocus,cvText:editCvText})
   });
   setScenario(updated.scenario);setPlan(updated.plan);
   setRole(updated.scenario.role);setJd(updated.scenario.jobDescription);setFocus(updated.scenario.focus);
   if(updated.cvText)setCvText(updated.cvText);
   setIsEditing(false);
   setMessage("Scenario updated successfully.");
  });
 }
 async function startPlanningReviewScript(){
  if(!scenario)return;
  await run(async()=>{
   setMessage("Calling AI to plan interview review meeting script...");
   const updated=await api<{scenario:Scenario;plan:Plan}>("/api/live/scenarios/"+scenario.id+"/plan",{method:"POST"});
   setScenario(updated.scenario);setPlan(updated.plan);
   setMessage("Interview review meeting script planned successfully!");
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
   changeStep("preflight");
  });
 }
 async function getCredential(){
  if(credential.current&&credential.current.expires>Date.now()+30000)return credential.current.value;
  const activeSession=sessionRef.current||session;
  if(!activeSession)throw new Error("Start a session to use speech");
  const data=await api<{token:string;region:string;expiresIn:number}>("/api/live/speech/token",{
   method:"POST",body:JSON.stringify({sessionId:activeSession.id})});
  credential.current={value:{token:data.token,region:data.region},expires:Date.now()+data.expiresIn*1000};
  return credential.current.value;
 }
 async function readQuestion(s:Session){
  const next=await api<Session>("/api/live/sessions/"+s.id+"/question",{method:"POST"});
  setSession(next);sessionRef.current=next;setHint("");setShowSuggestedAnswer(false);setRecognized("");setAnswer("");answerKey.current=null;
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
   setSession(s);sessionRef.current=s;changeStep("meeting",false,scenario.id,s.id);startKey.current=null;credential.current=null;
   const q=await readQuestion(s);
   if(q.state==="COMPLETED")changeStep("results",true,scenario.id,s.id);
   setMessage(q.nextQuestion?"AI interviewer is ready.":"The planned interview has finished.");
   if(q.nextQuestion&&q.nextQuestionId&&lastSpokenQuestionIdRef.current!==q.nextQuestionId){
    lastSpokenQuestionIdRef.current=q.nextQuestionId;
    void speak(q,true);
   }
  });
 }
 async function refreshSession(id:string){
  const next=await api<Session>("/api/demo/sessions/"+id);
  setSession(next);sessionRef.current=next;
  return next;
 }
 async function cloneFromSession(id:string){
  await run(async()=>{
   const source=await api<{
    role:string;jobDescription:string;focus:string;cvText:string;
    cvFilename:string;source:"snapshot"|"legacy"
   }>("/api/live/sessions/"+id+"/clone-source",{cache:"no-store"});
   // The clone is an independent draft. No transcript or question history is copied.
   const cloned=await api<Scenario>("/api/live/scenarios",{
    method:"POST",body:JSON.stringify({
     role:source.role,jobDescription:source.jobDescription,
     focus:source.focus,cvText:source.cvText,cvFilename:source.cvFilename,
     planImmediately:false
    })
   });
   setRole(source.role);setJd(source.jobDescription);setFocus(source.focus);
   setCvText(source.cvText);setCvName(source.cvFilename||"pasted-cv.txt");
   setSession(null);sessionRef.current=null;setConsent(false);setFeedback("");
   setHint("");setAnswer("");setRecognized("");setShowSuggestedAnswer(false);
   answerKey.current=null;startKey.current=null;
   await loadPlan(cloned.id);
   setIsEditing(true);
   changeStep("review",false,cloned.id,"");
   setMessage(source.source==="legacy"
    ?"New review created from the old meeting's saved CV and current JD. Verify the JD before generating the script."
    :"New review created from the meeting's original JD and CV. Edit them or generate a new script.");
  });
 }
 async function continueSession(id:string){
  await run(async()=>{
   const selected=await refreshSession(id);
   const config=JSON.parse(selected.speechConfig);
   setInterviewerLocale(config.interviewerLocale);setCandidateLocale(config.candidateSttLocale);
   setVoice(config.interviewerVoiceId);
   changeStep(selected.state==="COMPLETED"?"results":"meeting",false,selected.scenarioId,selected.id);
  });
 }
 async function action(kind:"pause"|"resume"|"finish"){
  if(!session)return;
  await run(async()=>{
   const next=await api<Session>("/api/demo/sessions/"+session.id,{method:"PATCH",
    body:JSON.stringify({action:kind,expectedVersion:session.version})});
   setSession(next);
   if(kind==="finish")changeStep("results");
  });
 }
 async function submit(overrideAnswer?:string){
  const textToSubmit=(typeof overrideAnswer==="string"?overrideAnswer:answer).trim();
  if(!session?.nextQuestionId||!textToSubmit)return;
  await run(async()=>{
   if(!answerKey.current)answerKey.current=crypto.randomUUID();
   const body={clientTurnId:answerKey.current,expectedTurnSequence:session.turns.length+1,
    expectedQuestionId:session.nextQuestionId,answer:textToSubmit,
    source:recognized?(textToSubmit===recognized?"client_stt":"corrected"):"typed",
    ...(recognized?{originalStt:recognized}:{})};
   try{
    const updated=await api<Session>("/api/demo/sessions/"+session.id+"/turns",{method:"POST",body:JSON.stringify(body)});
    setSession(updated);sessionRef.current=updated;answerKey.current=null;setHint("");setShowSuggestedAnswer(false);setAnswer("");setRecognized("");setInterimText("");
    if(updated.turns.length<15){
     const nextQ=await readQuestion(updated);
     if(nextQ.state==="COMPLETED")changeStep("results",true,session.scenarioId,session.id);
     if(nextQ.nextQuestion&&nextQ.nextQuestionId&&lastSpokenQuestionIdRef.current!==nextQ.nextQuestionId){
      lastSpokenQuestionIdRef.current=nextQ.nextQuestionId;
      void speak(nextQ,true,true);
     }
    }else{
     setMessage("15-turn limit reached; finish to review the transcript.");
    }
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
 async function speak(targetSession?:Session,silentError=false,autoListenAfter=true){
  const current=targetSession||sessionRef.current||session;
  if(!current?.nextQuestion)return;
  if(textOnly)return;
  try{
   const config=JSON.parse(current.speechConfig);
   const cred=await getCredential();
   await say(current.nextQuestion,config.interviewerVoiceId,cred);
   setMessage("Interviewer finished speaking. Bạn có thể trả lời bây giờ.");
   if(autoListenAfter && current.state==="IN_PROGRESS" && current.nextQuestionId){
    void startListening();
   }
  }catch(err){
   if(silentError){
    console.warn("Auto TTS speech could not play (browser may require click):", err);
    setMessage("Interviewer question ready. Click '▶ Speak question' để nghe câu hỏi hoặc '🎙 Speak answer' để trả lời.");
   }else{
    setError(err instanceof Error?err.message:String(err));
   }
  }
 }
 async function startListening(){
  const activeSession=sessionRef.current||session;
  if(!activeSession||activeSession.state!=="IN_PROGRESS"||!activeSession.nextQuestionId)return;
  if(textOnly||isRecordingRef.current)return;
  if(listenerRef.current){
   try{await listenerRef.current.stop();}catch{}
   listenerRef.current=null;
  }
  isRecordingRef.current=true;
  setIsRecording(true);
  setMessage("🎙️ Micro đang mở liên tục: Bạn hãy nói câu trả lời. Khi nói xong hãy bấm 'End talk & Submit' hoặc 'End talk'.");
  try{
   const config=JSON.parse(activeSession.speechConfig);
   const listener=await startContinuousListening(
    config.candidateSttLocale,
    await getCredential(),
    {
     onRecognizing:(partial)=>{
      setInterimText(partial);
     },
     onRecognized:(accumulated)=>{
      setRecognized(accumulated);
      setAnswer(accumulated);
      setInterimText("");
     },
     onError:(err)=>{
      console.warn("Continuous recognition error:", err);
     }
    }
   );
   listenerRef.current=listener;
  }catch(err){
   isRecordingRef.current=false;
   setIsRecording(false);
   setError(err instanceof Error?err.message:String(err));
  }
 }
 async function stopListening(submitAfter=false){
  if(!listenerRef.current&&!isRecordingRef.current)return;
  setIsRecording(false);
  isRecordingRef.current=false;
  try{
   let finalText="";
   if(listenerRef.current){
    finalText=await listenerRef.current.stop();
    listenerRef.current=null;
   }
   const textToUse=(finalText||answer||interimText).trim();
   setInterimText("");
   if(textToUse){
    setRecognized(textToUse);
    setAnswer(textToUse);
    setMessage("✓ Đã hoàn tất thu âm câu trả lời.");
    if(submitAfter){
     await submit(textToUse);
    }
   }else{
    setMessage("Chưa phát hiện giọng nói. Bạn có thể bấm '🎙 Speak answer' để nói lại hoặc gõ văn bản.");
   }
  }catch(err){
   setError(err instanceof Error?err.message:String(err));
  }
 }
 return <div className="shell" data-testid="live-workspace" data-hydrated={hydrated?"true":"false"}>
  <aside className="sidebar"><div className="brand">◉ <strong>Interview Simulation</strong></div>
   <div className="side-caption">AI LIVE · P1–P3</div>
   <nav aria-label="Interview steps">
    {(["prepare","review","preflight","meeting","results"] as const).map((x,i)=>
     <button key={x} className={step===x?"active":""} onClick={()=>changeStep(x)}>{i+1}. {x}</button>)}
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
     <label>Upload Job description (PDF, DOCX, TXT, MD; ≤4 MB)
      <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"jd");}}/>
     </label>
     <label>Job description<textarea rows={7} value={jd} maxLength={20000} onChange={e=>setJd(e.target.value)}/></label>
     <label>Interview focus (optional)<input value={focus} maxLength={1500} onChange={e=>setFocus(e.target.value)}/></label>
     <label>Upload CV (PDF, DOCX, TXT, MD; ≤4 MB)
      <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);}}/>
     </label>
     <label>Or paste/edit CV text<textarea rows={7} value={cvText} maxLength={30000}
       onChange={e=>{setCvText(e.target.value);setCvName("pasted-cv.txt");}}/></label>
     <button className="btn primary" disabled={busy||jd.trim().length<10||cvText.trim().length<15}
      onClick={create}>Create interview scenario</button>
    </section><section className="panel"><h2>Prior live sessions</h2>
      {history.filter(x=>x.mode==="live").length===0?<p>No previous AI sessions.</p>:
       history.filter(x=>x.mode==="live").map(s=><div key={s.id} className="prior-session-row">
        <button className="list-button" disabled={busy}
         onClick={()=>continueSession(s.id)}>{new Date(s.createdAt).toLocaleString()} · {s.state} →</button>
        <div className="prior-session-actions">
         <button type="button" className="btn secondary" disabled={busy}
          aria-label={`Clone JD & CV from meeting ${new Date(s.createdAt).toLocaleString()}`}
          onClick={()=>cloneFromSession(s.id)}>Clone JD & CV</button>
         <Link href={`/sessions/${s.id}`}>Detail ↗</Link>
        </div>
       </div>)}
     <p className="muted small">PDF text extraction happens in your browser. The extracted CV text is saved on this server for AI planning. Voice audio is processed by Azure but is not saved by this app.</p>
    </section></div>}
    {step==="review"&&<div className="cols"><section className="panel">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px",flexWrap:"wrap",gap:"8px"}}>
        <h2 style={{margin:0}}>2. Scenario details · revision {scenario?.latestRevision}</h2>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <span className="pill">{approved?"Approved":"Draft"} v{scenario?.latestRevision}</span>
          {scenario&&<Link href={`/scenarios/${scenario.id}`} className="btn quiet small" style={{color:"#555ddb"}}>Open full page ↗</Link>}
          {!isEditing&&scenario&&<button className="btn secondary" onClick={()=>{
            setEditRole(scenario.role);
            setEditJd(scenario.jobDescription);
            setEditFocus(scenario.focus);
            setEditCvText(cvText);
            setIsEditing(true);
          }} disabled={busy}>Update</button>}
        </div>
      </div>

      {isEditing ? (
        <div className="form-grid">
          <h3>Edit scenario</h3>
          <label>Role<input value={editRole} maxLength={180} onChange={e=>setEditRole(e.target.value)} disabled={busy}/></label>
          <label>Tech stack / focus<input value={editFocus} maxLength={1500} onChange={e=>setEditFocus(e.target.value)} disabled={busy}/></label>
          <label>Upload new Job description file (optional: PDF, DOCX, TXT, MD; ≤4 MB)
            <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"jd");}}/>
          </label>
          <label>Job description<textarea rows={6} value={editJd} maxLength={20000} onChange={e=>setEditJd(e.target.value)} disabled={busy}/></label>
          <label>Upload new CV file (optional: PDF, DOCX, TXT, MD; ≤4 MB)
            <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"cv");}}/>
          </label>
          <label>CV text<textarea rows={6} value={editCvText} maxLength={30000} onChange={e=>setEditCvText(e.target.value)} disabled={busy}/></label>
          <div style={{display:"flex",gap:"8px"}}>
            <button className="btn primary" onClick={saveScenarioUpdate} disabled={busy||editRole.trim().length<3||editJd.trim().length<10||editCvText.trim().length<15}>
              Save update
            </button>
            <button className="btn secondary" onClick={()=>setIsEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {!scenario ? <p>Generate or select a scenario first.</p> : (
            <div style={{display:"grid",gap:"12px",marginBottom:"20px"}}>
              <div>
                <small className="muted">Role</small>
                <h3 style={{margin:"2px 0 4px"}}>{scenario.role}</h3>
              </div>
              {scenario.focus&&<div>
                <small className="muted">Tech stack / focus</small>
                <p style={{margin:"2px 0"}}>{scenario.focus}</p>
              </div>}
              <div>
                <small className="muted">Job description</small>
                <p style={{margin:"4px 0",whiteSpace:"pre-wrap",background:"#f8fafc",padding:"12px",borderRadius:"8px",border:"1px solid #e2e8f0",fontSize:"14px"}}>
                  {scenario.jobDescription}
                </p>
              </div>
              <div>
                <small className="muted">CV text ({cvName})</small>
                <p style={{margin:"4px 0",maxHeight:"120px",overflowY:"auto",whiteSpace:"pre-wrap",background:"#f8fafc",padding:"10px",borderRadius:"8px",border:"1px solid #e2e8f0",fontSize:"13px"}}>
                  {cvText || "No CV text available"}
                </p>
              </div>
              <div style={{marginTop:"8px"}}>
                <button className="btn primary" onClick={startPlanningReviewScript} disabled={busy}>
                  start planning review metting script
                </button>
              </div>
            </div>
          )}

          <hr style={{margin:"24px 0",border:"0",borderTop:"1px solid #e2e8f0"}}/>

          <h2>Meeting script & review plan</h2>
          {!plan ? (
            <div style={{padding:"18px",background:"#f0f7ff",borderRadius:"10px",border:"1px dashed #b8d2f2"}}>
              <p style={{margin:0,color:"#355d8d"}}>
                Script is not planned yet. Click <b>start planning review metting script</b> above to start calling AI to generate the interview questions and rubric.
              </p>
            </div>
          ) : (
            <>
              <h3>{plan.role} · {plan.level}</h3><p>{plan.overview}</p>
              <p className="muted small">Standalone: answer once, then the next planned question. Interactive: AI may ask scenario-specific follow-ups until the goal is met or the follow-up limit is reached.</p>
              {plan.stages.map((stage,i)=><div key={i}><h3>{i+1}. {stage.topic}</h3>
               <ol>{stage.questions.map((q,j)=>{
                const item=stage.items?.[j];
                return <li key={j} className="flow-script-item">
                 <span className="flow-script-badge">{!item?"Legacy adaptive":item.type==="interactive"?"Interactive scenario":"Standalone"}</span>
                 <div><strong>{q}</strong></div>
                 {!item?<p className="muted small">Old script: AI may generate follow-up questions; sequence is not guaranteed.</p>
                 :item.type==="interactive"?<>
                  <p className="muted small">Goal: {item.goal}</p>
                  <p className="muted small">AI follow-ups: max {item.maxFollowUps}. Complete when: {item.completionCriteria}</p>
                 </>:<p className="muted small">One answer → next scripted question</p>}
                 {(item?.suggestedAnswer||stage.suggestedAnswers?.[j])&&<details><summary>Suggested answer</summary>
                  <p>{item?.suggestedAnswer||stage.suggestedAnswers?.[j]}</p></details>}
                </li>;
               })}</ol></div>)}
              <h3>Evaluation rubric</h3><ul>{plan.rubric.map((rub,i)=><li key={i}><b>{rub.competency}:</b> {rub.criteria}</li>)}</ul>
              <button className="btn primary" onClick={approve} disabled={busy||!scenario}>Approve this revision →</button>
            </>
          )}
        </>
      )}
     </section><section className="panel form-grid"><h2>Ask planner to revise</h2>
       <p>Revisions create a new unapproved version; previously approved versions remain immutable.</p>
       <textarea aria-label="Revision request" rows={5} value={feedback} maxLength={1000}
        placeholder="e.g. Focus more on system design and database incidents..."
        onChange={e=>setFeedback(e.target.value)} disabled={busy||!plan}/>
       <button className="btn secondary" onClick={revise} disabled={busy||!scenario||!plan||feedback.trim().length<3}>Revise with AI</button>
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
       {session?.nextQuestionType&&session.nextQuestionType!=="legacy"&&<p className="meeting-flow-status">
        {session.nextQuestionType==="interactive"
         ? `Interactive · ${session.nextScenarioTitle||"Scenario"} · Follow-ups ${session.nextFollowUpDepth||0}/${session.nextFollowUpLimit||0}`
         : "Standalone · One answer, then next planned question"}
       </p>}
       <p>{session?.nextQuestion||"No current question. Generate or resume the interview."}</p>
      </div>
      <div className="meeting-controls">
       <button className="btn secondary" disabled={busy||!session||session.state!=="IN_PROGRESS"||!!session.nextQuestion}
        onClick={()=>session&&run(async()=>{await readQuestion(session);})}>Generate question</button>
       <button className="btn secondary" disabled={busy||textOnly||!session?.nextQuestion||session?.state!=="IN_PROGRESS"} onClick={()=>speak(undefined,false)}>▶ Speak question</button>
       {isRecording ? (
        <>
         <button className="btn primary" style={{background:"#dc2626",borderColor:"#b91c1c",color:"#fff",fontWeight:600}} disabled={busy} onClick={()=>stopListening(true)}>
          ⏹️ End talk & Submit
         </button>
         <button className="btn secondary" style={{borderColor:"#b91c1c",color:"#b91c1c"}} disabled={busy} onClick={()=>stopListening(false)}>
          ⏹️ End talk (keep text)
         </button>
        </>
       ) : (
        <button className="btn secondary" disabled={busy||textOnly||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"} onClick={startListening}>
         🎙️ Speak answer
        </button>
       )}
       <button className="btn secondary" disabled={busy||!session?.nextQuestion||session?.state!=="IN_PROGRESS"} onClick={hintForQuestion}>💡 Private hint</button>
       <button className="btn secondary" disabled={!session?.nextSuggestedAnswer} onClick={()=>setShowSuggestedAnswer(value=>!value)}>
        {showSuggestedAnswer?"Hide suggested answer":"Show suggested answer"}
       </button>
       {session?.state==="IN_PROGRESS"?<button className="btn secondary" onClick={()=>action("pause")} disabled={busy}>Pause</button>:
        <button className="btn secondary" onClick={()=>action("resume")} disabled={busy||!["PAUSED","INTERRUPTED"].includes(session?.state||"")}>Resume</button>}
       <button className="btn danger" onClick={()=>action("finish")} disabled={busy||!["PAUSED","INTERRUPTED","IN_PROGRESS"].includes(session?.state||"")}>Finish</button>
      </div>
      {showSuggestedAnswer&&session?.nextSuggestedAnswer&&<div className="panel hint" data-testid="suggested-answer">
       <h3>Suggested answer · practice reference</h3><p style={{whiteSpace:"pre-wrap"}}>{session.nextSuggestedAnswer}</p>
       <p className="muted small">Adapt this to your own experience; do not claim details that are not yours.</p>
      </div>}
      {hint&&<div className="panel hint"><h3>Private AI coaching hint</h3><p>{hint}</p><p className="muted small">Hint exposure is logged in workflow evidence.</p></div>}
      <div className="panel form-grid">
       {isRecording && (
        <div style={{padding:"12px 16px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:"8px",marginBottom:"8px"}}>
         <div style={{display:"flex",alignItems:"center",gap:"10px",color:"#b91c1c",fontWeight:600,fontSize:"14px"}}>
          <span style={{display:"inline-block",width:10,height:10,borderRadius:"50%",background:"#ef4444"}}></span>
          🎙️ Micro đang mở liên tục: Bạn cứ nói tự nhiên. Nói xong bấm &quot;End talk &amp; Submit&quot; để nộp câu trả lời.
         </div>
         {interimText && (
          <p style={{margin:"8px 0 0",fontStyle:"italic",color:"#7f1d1d",fontSize:"14px",background:"#fff",padding:"6px 10px",borderRadius:"6px",border:"1px solid #fee2e2"}}>
           💬 Đang nói: &quot;{interimText}&quot;
          </p>
         )}
        </div>
       )}
       <label>Your answer (speech can be corrected before saving)
       <textarea rows={5} value={answer} maxLength={12000} onChange={e=>{if(!busy){setAnswer(e.target.value);answerKey.current=null;}}}
         disabled={busy||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"}/></label>
       <button className="btn primary" onClick={()=>submit()} disabled={busy||!answer.trim()||!session?.nextQuestionId||session?.state!=="IN_PROGRESS"}>✓ Commit answer & next question</button>
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
      <button className="btn secondary" onClick={()=>{setSession(null);changeStep("prepare");}}>New interview</button>
     </section>}
    <div className="panel"><h3>Your data</h3>
     <p className="muted small">Stored CV text, scenarios, interview transcript and evidence can be erased. This deletes both demo and live interviews for your account and cannot be undone.</p>
     <button className="btn danger" disabled={busy} onClick={()=>{if(window.prompt("Type DELETE ALL MY INTERVIEW DATA to permanently delete all your scenarios and sessions")!=="DELETE ALL MY INTERVIEW DATA")return;
       void run(async()=>{await api("/api/me/data",{method:"DELETE",body:JSON.stringify({confirm:"DELETE ALL MY INTERVIEW DATA"})});
         setScenario(null);setPlan(null);setSession(null);setHistory([]);changeStep("prepare");setMessage("Your interview data has been deleted.");});}}>
       Delete my interview data</button>
    </div>
    <footer>AI planning (P1) · Azure browser speech (P2) · Adaptive interview and hints (P3) · Evaluation and audit: P4</footer>
   </main></div></div>;
}
