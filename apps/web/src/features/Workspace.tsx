"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createAuthClient } from "better-auth/react";
import { voiceByLocale } from "@interview/core";

type Locale = keyof typeof voiceByLocale;
type Screen = "dashboard"|"new"|"scenario"|"preflight"|"meeting"|"paused"|"results"|"history";
type Scenario = {id:string;role:string;jobDescription:string;focus:string;latestRevision:number;revisions:{revision:number;approvedAt:number|null;notes:string}[]};
type ScenarioSummary = Pick<Scenario,"id"|"role"|"focus"|"latestRevision">;
type Page<T> = {items:T[];total:number;nextOffset:number|null};
type Session = {id:string;scenarioId:string;scenarioRevision:number;state:string;version:number;createdAt:number;
  speechConfig:string;scenario?:{role:string;focus:string};nextQuestion?:string|null;
  turns?:{id:string;sequence:number;question:string;answer:string;answerSource:string;originalStt:string|null;createdAt:number}[]};
type Event = {id:string;seq:number;type:string;timestamp:number;metadata:string};

class ApiError extends Error { constructor(message:string,readonly status:number){super(message);} }
const client=createAuthClient();
const labels: [Screen,string][]=[["dashboard","Dashboard"],["new","New interview"],["scenario","Scenario review"],
  ["preflight","Language & voice"],["meeting","Live meeting"],["paused","Pause / resume"],["results","Results"],["history","History & audit"]];
async function api<T>(url:string,options?:RequestInit):Promise<T>{
  const result=await fetch(url,{credentials:"same-origin",...options,
    headers:{"Content-Type":"application/json",...(options?.headers??{})}});
  const data=await result.json();
  if(!result.ok)throw new ApiError(data.error??`HTTP ${result.status}`,result.status);
  return data as T;
}
const toDate=(ts:number)=>new Date(ts).toLocaleString();
export default function Workspace({userEmail}:{userEmail:string}) {
  const [screen,setScreen]=useState<Screen>("dashboard");
  const [hydrated,setHydrated]=useState(false);
  const [scenarios,setScenarios]=useState<ScenarioSummary[]>([]);
  const [scenarioTotal,setScenarioTotal]=useState(0);
  const [scenarioNext,setScenarioNext]=useState<number|null>(null);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [sessionTotal,setSessionTotal]=useState(0);
  const [sessionNext,setSessionNext]=useState<number|null>(null);
  const [scenario,setScenario]=useState<Scenario|null>(null);
  const [session,setSession]=useState<Session|null>(null);
  const [events,setEvents]=useState<Event[]>([]);
  const [eventsSessionId,setEventsSessionId]=useState<string|null>(null);
  const [role,setRole]=useState("Senior Backend Engineer");
  const [focus,setFocus]=useState("Node.js, PostgreSQL, system design");
  const [jd,setJd]=useState("Design reliable backend services, debug database performance, mentor engineers and communicate trade-offs.");
  const [revisionNotes,setRevisionNotes]=useState("");
  const [interviewerLocale,setInterviewerLocale]=useState<Locale>("en-US");
  const [candidateLocale,setCandidateLocale]=useState<Locale>("vi-VN");
  const [voice,setVoice]=useState<string>(voiceByLocale["en-US"][0]);
  const [consent,setConsent]=useState(false);
  const [hint,setHint]=useState(false);
  const [answer,setAnswer]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const requestKeyRef=useRef<string|null>(null);
  const answerKeyRef=useRef<string|null>(null);

  const refresh=useCallback(async()=>{
    const [a,b]=await Promise.all([api<Page<ScenarioSummary>>("/api/demo/scenarios?limit=20"),api<Page<Session>>("/api/demo/sessions?limit=20")]);
    setScenarios(a.items);setScenarioTotal(a.total);setScenarioNext(a.nextOffset);
    setSessions(b.items);setSessionTotal(b.total);setSessionNext(b.nextOffset);
  },[]);
  useEffect(()=>{setHydrated(true);refresh().catch(e=>setError(String(e)));},[refresh]);
  async function loadMore(kind:"scenarios"|"sessions"){
    const offset=kind==="scenarios"?scenarioNext:sessionNext;
    if(offset===null)return;
    await run(async()=>{
      if(kind==="scenarios"){
        const page=await api<Page<ScenarioSummary>>("/api/demo/scenarios?limit=20&offset="+offset);
        setScenarios(prev=>[...prev,...page.items.filter(row=>!prev.some(existing=>existing.id===row.id))]);
        setScenarioTotal(page.total);setScenarioNext(page.nextOffset);
      }else{
        const page=await api<Page<Session>>("/api/demo/sessions?limit=20&offset="+offset);
        setSessions(prev=>[...prev,...page.items.filter(row=>!prev.some(existing=>existing.id===row.id))]);
        setSessionTotal(page.total);setSessionNext(page.nextOffset);
      }
    });
  }
  async function run(task:()=>Promise<void>){
    if(busy)return;
    setBusy(true);setError("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:"Unexpected error");}
    finally{setBusy(false);}
  }
  async function create(){
    await run(async()=>{
      const created=await api<Scenario>("/api/demo/scenarios",{method:"POST",body:JSON.stringify({role,jobDescription:jd,focus})});
      setScenario(await api<Scenario>(`/api/demo/scenarios/${created.id}`));requestKeyRef.current=null;setConsent(false);
      setNotice("Deterministic demo scenario created; no LLM called.");setScreen("scenario");await refresh();
    });
  }
  async function openScenario(id:string){
    await run(async()=>{setScenario(await api<Scenario>(`/api/demo/scenarios/${id}`));setConsent(false);requestKeyRef.current=null;setScreen("scenario");});
  }
  async function changeScenario(action:"approve"|"revise"){
    if(!scenario)return;
    await run(async()=>{
      const next=await api<Scenario>(`/api/demo/scenarios/${scenario.id}`,{method:"PATCH",body:JSON.stringify({
        action,expectedRevision:scenario.latestRevision,...(action==="revise"?{notes:revisionNotes}:{})
      })});
      setScenario(next);setRevisionNotes("");
      setNotice(action==="approve"?"Scenario approved. You can configure your meeting.":"New draft revision created. Approval is required again.");
      if(action==="approve"){setConsent(false);requestKeyRef.current=null;setScreen("preflight");}
      await refresh();
    });
  }
  function onLocaleChange(value:Locale){
    setInterviewerLocale(value);
    setVoice(voiceByLocale[value][0]);
  }
  async function start(){
    if(!scenario)return setError("Create a scenario first");
    const latest=scenario.revisions.find(r=>r.revision===scenario.latestRevision);
    if(!latest?.approvedAt){setError("Approve the latest scenario revision before starting");setScreen("scenario");return;}
    if(!consent){setError("You must explicitly consent to transcript retention");return;}
    await run(async()=>{
      if(!requestKeyRef.current)requestKeyRef.current=crypto.randomUUID();
      const created=await api<Session>("/api/demo/sessions",{method:"POST",body:JSON.stringify({
        scenarioId:scenario.id,revision:scenario.latestRevision,requestKey:requestKeyRef.current,
        speech:{interviewerLocale,interviewerVoiceId:voice,candidateSttLocale:candidateLocale,consentToTranscript:consent}
      })});
      setSession(created);setEvents([]);setEventsSessionId(null);setConsent(false);requestKeyRef.current=null;setScreen("meeting");setNotice("Demo interview started. No audio is captured.");
      await refresh();
    });
  }
  async function openSession(id:string){
    await run(async()=>{
      const selected=await api<Session>(`/api/demo/sessions/${id}`);
      setSession(selected);setEvents([]);setEventsSessionId(null);setAnswer("");answerKeyRef.current=null;
      setScreen(selected.state==="PAUSED"||selected.state==="INTERRUPTED"?"paused":selected.state==="COMPLETED"?"results":"meeting");
    });
  }
  async function sessionAction(action:"pause"|"resume"|"finish"|"cancel"){
    if(!session)return;
    await run(async()=>{
      const updated=await api<Session>(`/api/demo/sessions/${session.id}`,{
        method:"PATCH",body:JSON.stringify({action,expectedVersion:session.version})
      });
      setSession(updated);
      setScreen(action==="pause"?"paused":action==="finish"?"results":"meeting");
      await refresh();
    });
  }
  async function submitAnswer(){
    if(!session||!answer.trim())return;
    await run(async()=>{
      if(!answerKeyRef.current)answerKeyRef.current=crypto.randomUUID();
      const submittedAnswer=answer;
      const expectedTurnSequence=(session.turns?.length??0)+1;
      let updated:Session;
      try {
        updated=await api<Session>(`/api/demo/sessions/${session.id}/turns`,{
          method:"POST",body:JSON.stringify({clientTurnId:answerKeyRef.current,expectedTurnSequence,answer:submittedAnswer,source:"typed"})
        });
      } catch(error) {
        if(error instanceof ApiError&&error.status===409){
          setSession(await api<Session>(`/api/demo/sessions/${session.id}`));
          setAnswer("");answerKeyRef.current=null;
          throw new Error("This interview moved to another question. Stale answer discarded; review the current question.");
        }
        throw error;
      }
      setSession(updated);setAnswer("");answerKeyRef.current=null;
      setNotice("Answer and workflow event saved to your local SQLite DB.");
    });
  }
  async function showEvents(){
    if(!session)return;
    await run(async()=>{
      const selectedId=session.id;
      setEventsSessionId(null);setEvents([]);
      const list=await api<Event[]>(`/api/demo/sessions/${selectedId}?include=events`);
      setEvents(list);setEventsSessionId(selectedId);setScreen("history");
    });
  }
  const approved=!!scenario?.revisions.find(r=>r.revision===scenario.latestRevision)?.approvedAt;
  const active=screen==="meeting"&&session?.state==="IN_PROGRESS";
  const canAnswer=active&&typeof session?.nextQuestion==="string";
  const recoverable=session?.state==="PAUSED"||session?.state==="INTERRUPTED";
  return <div className="shell" data-testid="workspace-shell" data-hydrated={hydrated?"true":"false"}>
    <aside className="sidebar">
      <div className="brand">◉ <strong>Interview<br/>Simulation</strong></div>
      <div className="side-caption">OPEN-SOURCE · P0 DEMO</div>
      <nav aria-label="Main navigation"><a href="/live" className="live-entry">✦ AI Interview (P1–P3) →</a>{labels.map(([name,label])=>
        <button key={name} className={screen===name?"active":""} onClick={()=>{setError("");if(name==="new"){setScenario(null);setConsent(false);}setScreen(name);}}>{label}</button>)}</nav>
      <div className="sidebar-bottom"><small>Offline mock prompts. No STT, TTS or LLM calls.</small></div>
    </aside>
    <div className="main-area">
      <header className="topbar"><span className="eyebrow">INTERVIEW WORKSPACE · DEMO MODE</span>
        <div className="user-bar"><small>{userEmail}</small><button className="btn quiet" onClick={async()=>{await client.signOut();window.location.assign("/signin");}}>Sign out</button></div>
      </header>
      <main className="page">
        {error&&<div className="alert error" role="alert">{error}</div>}
        {notice&&<div className="alert info" role="status">{notice}<button className="dismiss" onClick={()=>setNotice("")}>×</button></div>}
        {screen==="dashboard"&&<section><p className="eyebrow">01 / Dashboard</p><h1>Your interview workspace</h1>
          <p className="lead">Prepare with a job description, approve your questions, and practice a deterministic mock interview.</p>
          <div className="hero"><div><h2>Ready for your next interview?</h2><p>Practice without a paid Azure or LLM API key.</p></div><button className="btn primary" onClick={()=>setScreen("new")}>+ Create interview</button></div>
          <div className="stats"><article className="panel"><span>Scenarios</span><strong>{scenarioTotal}</strong></article>
            <article className="panel"><span>Sessions</span><strong>{sessionTotal}</strong></article>
            <article className="panel"><span>Completed (loaded)</span><strong>{sessions.filter(s=>s.state==="COMPLETED").length}</strong></article></div>
          <div className="panel"><h2>Recent sessions</h2>{sessions.length===0?<p className="muted">No interviews yet. Create one to begin.</p>:
            sessions.slice(0,5).map(s=><button className="list-button" key={s.id} onClick={()=>openSession(s.id)}>{toDate(s.createdAt)} · {s.state} →</button>)}</div>
        </section>}
        {screen==="new"&&<section><p className="eyebrow">02 / New interview</p><h1>Describe the job</h1><p className="lead">P0 uses local fixtures. PDF/DOCX parsing and real scenario generation arrive in P1.</p>
          <div className="cols"><div className="panel form-grid">
            <label>Role<input maxLength={180} value={role} onChange={e=>setRole(e.target.value)}/></label>
            <label>Tech stack / focus<input maxLength={1500} value={focus} onChange={e=>setFocus(e.target.value)}/></label>
            <label>Job description<textarea rows={8} value={jd} maxLength={20000} onChange={e=>setJd(e.target.value)}/></label>
            <div className="disabled-upload" aria-disabled="true">CV PDF / DOCX — available in P1, not P0 demo</div>
            <button className="btn primary" disabled={busy} onClick={create}>Create demo scenario →</button>
          </div><div className="panel"><h2>Planned experience</h2><p>Review the draft, request a new revision, explicitly approve it, then choose interviewer language, voice and your input language.</p><p className="muted">Uploaded documents are not accepted in P0. No CV files are stored or transmitted.</p></div></div>
        </section>}
        {screen==="scenario"&&<section><p className="eyebrow">03 / Scenario planning</p><h1>Review & approve</h1>
          {!scenario?<div className="panel"><p>Select an existing scenario or create a new one.</p>{scenarios.map(s=>
            <button className="list-button" key={s.id} onClick={()=>openScenario(s.id)}>{s.role} · v{s.latestRevision}</button>)}
            {scenarioNext!==null&&<button className="btn secondary" disabled={busy} onClick={()=>loadMore("scenarios")}>Load more scenarios</button>}
            <button className="btn primary" onClick={()=>setScreen("new")}>Create new</button></div>:
          <div className="cols"><div className="panel">
            <span className="pill">{approved?"Approved":"Draft"} v{scenario.latestRevision}</span>
            <h2>{scenario.role}</h2><p><b>Focus:</b> {scenario.focus}</p>
            <h3>Scenario stages (deterministic demo)</h3><ol><li>Background and prior projects</li><li>Production troubleshooting</li><li>System design and trade-offs</li><li>Wrap-up</li></ol>
            <p><b>Source JD:</b> {scenario.jobDescription}</p>
            <p className="muted">Previous approved revisions remain immutable after edits.</p>
            <button className="btn secondary" onClick={()=>{setScenario(null);setConsent(false);}}>Browse scenarios</button>
            <button className="btn primary" disabled={busy} onClick={()=>changeScenario("approve")}>{approved?"Continue to preflight":"✓ Approve latest revision"}</button>
          </div><div className="panel"><h2>Planner revision chat (demo)</h2>
            {scenario.revisions.map(r=><p key={r.revision} className="chat-bubble">v{r.revision}: {r.notes} {r.approvedAt?"✓ approved":""}</p>)}
            <label>Request a revision<textarea placeholder="Ask to emphasize databases, system design, communication..." rows={4}
              maxLength={1000} value={revisionNotes} onChange={e=>setRevisionNotes(e.target.value)}/></label>
            <button className="btn secondary" disabled={busy||!revisionNotes.trim()} onClick={()=>changeScenario("revise")}>Create unapproved revision</button>
          </div></div>}
        </section>}
        {screen==="preflight"&&<section><p className="eyebrow">04 / Meeting preflight</p><h1>Choose language, voice & devices</h1>
          <p className="lead">All three settings are independent. Changing the interviewer output language never changes your microphone input language.</p>
          <div className="cols"><div className="panel form-grid">
            <label>AI interviewer language<select value={interviewerLocale} onChange={e=>onLocaleChange(e.target.value as Locale)}>
              <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="vi-VN">Tiếng Việt</option></select></label>
            <label>AI interviewer voice<select value={voice} onChange={e=>setVoice(e.target.value)}>
              {voiceByLocale[interviewerLocale].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
            <button className="btn secondary" onClick={()=>setNotice("Demo preview only: no Azure voice is played.")}>▶ Preview voice (mock)</button>
            <label>Your microphone input language<select value={candidateLocale} onChange={e=>setCandidateLocale(e.target.value as Locale)}>
              <option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="vi-VN">Tiếng Việt</option></select></label>
            <p className="soft-notice">P0 shows scripted interviewer questions in {interviewerLocale} (text only, no audio). Future voice: {voice}. Candidate input locale: {candidateLocale}. No silent translation.</p>
            <label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
              I explicitly consent to save this practice transcript and workflow evidence on this self-hosted server.</label>
            <p className="muted small">No raw audio is recorded. Your practice data remains in SQLite until you remove it using future data controls or the server operator retention process.</p>
            <button className="btn primary" disabled={!approved||!consent||busy} onClick={start}>Start meeting →</button>
            {!approved&&<p className="error" role="status">Approve the latest scenario version before starting.</p>}
          </div><div className="panel"><h2>Device check</h2>
            <div className="device-row"><button className="btn secondary" onClick={()=>setNotice("Microphone test is a demo placeholder, not an actual permission check.")}>🎙 Test mic (mock)</button>
              <button className="btn secondary" onClick={()=>setNotice("Speaker test is a demo placeholder, not real playback.")}>🔊 Test speaker (mock)</button></div>
            <h3>Meeting policy</h3><p>Half-duplex · typed-answer fallback · scripted interviewer</p>
            <p>Raw audio: <b>off</b></p><p>Scenario: <b>{scenario?.role??"Not selected"}</b> {approved?"✓ approved":"not approved"}</p>
          </div></div>
        </section>}
        {screen==="meeting"&&<section><p className="eyebrow">05 / Meeting</p><h1>{session?.scenario?.role??"Live meeting"} <span className="pill">{session?.state??"No session"}</span></h1>
          {!session?<div className="panel"><p>Create and start a practice session in Preflight.</p><button className="btn primary" onClick={()=>setScreen("preflight")}>Go to preflight</button></div>:
          <div className="meeting-layout"><div>
            <div className="meeting-video"><div className="avatar">👩🏻‍💼</div><strong>AI Interviewer · scripted demo</strong>
              <p>{session.nextQuestion??"Interview not currently accepting answers."}</p></div>
            <div className="meeting-controls"><button className="btn secondary" disabled={!active||busy} onClick={()=>sessionAction("pause")}>⏸ Pause</button>
              <button className="btn secondary" disabled={!active||busy} onClick={()=>setHint(v=>!v)}>💡 {hint?"Hide":"Show"} hint (demo)</button>
              <button className="btn danger" disabled={!active||busy} onClick={()=>sessionAction("finish")}>End interview</button></div>
            {hint&&<div className="panel hint"><strong>Practice prompt (not model-generated)</strong><p>Use a concise example: situation, your action, trade-offs and outcome. Do not invent experience. This demo hint is not persisted or scored.</p></div>}
            {active&&!canAnswer&&<p className="soft-notice" role="status">You have reached the 15-answer demo limit. End this interview to review your history.</p>}
            <div className="panel form-grid"><label>Type answer (STT fallback / offline demo)<textarea rows={4} value={answer} maxLength={12000}
              onChange={e=>{if(!busy){setAnswer(e.target.value);answerKeyRef.current=null;}}} disabled={!canAnswer||busy}/></label>
              <button className="btn primary" disabled={!canAnswer||!answer.trim()||busy} onClick={submitAnswer}>✓ Finish answer</button></div>
          </div><div className="panel transcript"><h2>Transcript</h2><p className="muted small">Original typed answers are persisted; no microphone capture occurs in P0.</p>
            {(session.turns??[]).map(t=><div className="turn" key={t.id}><strong>Q{t.sequence} · Interviewer</strong><p>{t.question}</p>
              <strong>You · {t.answerSource}</strong><p>{t.answer}</p></div>)}
            {session.turns?.length===0&&<p className="muted">Waiting for your first answer.</p>}</div></div>}
        </section>}
        {screen==="paused"&&<section><p className="eyebrow">06 / Recovery</p><h1>{session?.state==="INTERRUPTED"?"Interview interrupted":"Interview paused"}</h1><div className="panel">
          <p>Answers are saved in SQLite. Resuming continues from the next scripted question; already-committed turns are not duplicated.</p>
          <button className="btn primary" disabled={!recoverable||busy} onClick={()=>sessionAction("resume")}>▶ Resume meeting</button>
          <button className="btn secondary" disabled={!recoverable||busy} onClick={()=>sessionAction("finish")}>End without resuming</button></div>
        </section>}
        {screen==="results"&&<section><p className="eyebrow">07 / Practice feedback</p><h1>Session summary</h1>
          <div className="panel"><h2>{session?.state==="COMPLETED"?"Practice completed":"Evaluation unavailable"}</h2>
            <p>Answers recorded: <b>{session?.turns?.length??0}</b></p>
            <p>Scoring, rubric evidence and model evaluation are deliberately not implemented until P4.</p>
            <button className="btn primary" onClick={showEvents} disabled={!session||busy}>Review transcript & workflow events</button>
          </div></section>}
        {screen==="history"&&<section><p className="eyebrow">08 / History & audit</p><h1>Durable session history</h1>
          <div className="panel"><h2>Sessions</h2>{sessions.length===0?<p className="muted">No practice sessions recorded yet.</p>:
            sessions.map(s=><button key={s.id} className="list-button" onClick={()=>openSession(s.id)}>
              {toDate(s.createdAt)} · {s.state} · scenario revision {s.scenarioRevision} →</button>)}
            {sessionNext!==null&&<button className="btn secondary" disabled={busy} onClick={()=>loadMore("sessions")}>Load more sessions</button>}</div>
          {session&&<div className="panel"><h2>Selected session evidence</h2>
            <button className="btn secondary" onClick={showEvents} disabled={busy}>Load sanitized workflow events</button>
            {eventsSessionId===session.id&&events.map(e=><p className="event" key={e.id}>{e.seq} · {e.type} · {toDate(e.timestamp)}</p>)}
            <p className="muted small">ZIP export and independent AI workflow audit are planned for P4, not available in P0.</p></div>}
        </section>}
        <footer>Open source P0 demo · AI generation (P1) · Azure Speech (P2) · Evaluation and audit ZIP (P4)</footer>
      </main>
    </div>
  </div>;
}
