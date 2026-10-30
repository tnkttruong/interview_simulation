"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createAuthClient } from "better-auth/react";
import { voiceByLocale } from "@interview/core";
import { checkMicrophone, checkSpeaker } from "./azure-client";

type Locale = keyof typeof voiceByLocale;
type Revision = { revision: number; approvedAt: number | null; notes: string };
type Scenario = {
  id: string;
  role: string;
  jobDescription: string;
  focus: string;
  latestRevision: number;
  revisions: Revision[];
};
type Session = {
  id: string;
  scenarioId: string;
  scenarioRevision: number;
  state: string;
  version: number;
};

const client = createAuthClient();

export default function ScenarioPreflight({
  scenarioId,
  userEmail,
}: {
  scenarioId: string;
  userEmail: string;
}) {
  const router = useRouter();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [interviewerLocale, setInterviewerLocale] = useState<Locale>("en-US");
  const [scriptLocale,setScriptLocale] = useState<Locale|null>(null);
  const [candidateLocale, setCandidateLocale] = useState<Locale>("vi-VN");
  const [voice, setVoice] = useState<string>(voiceByLocale["en-US"][0]);
  const [consent, setConsent] = useState(false);

  const [micOk, setMicOk] = useState(false);
  const [speakerOk, setSpeakerOk] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState("");

  const requestKeyRef = useRef<string | null>(null);

  const loadScenario = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/demo/scenarios/${scenarioId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Scenario not found");
      const data = await res.json();
      setScenario(data);
      const planResponse=await fetch(`/api/live/scenarios/${scenarioId}`,{credentials:"same-origin"});
      if(planResponse.ok){
       const info=await planResponse.json() as {plan?:{bilingual?:{interviewerLocale:Locale}}};
       const selected=info.plan?.bilingual?.interviewerLocale||null;
       setScriptLocale(selected);
       if(selected){setInterviewerLocale(selected);setVoice(voiceByLocale[selected][0]);}
      }
      if (typeof window !== "undefined") {
        sessionStorage.setItem("last_scenario_id", data.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load scenario");
    } finally {
      setLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    void loadScenario();
  }, [loadScenario]);

  useEffect(() => {
    fetch("/api/me/ai-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { settings?: { interviewerLocale: Locale; candidateSttLocale: Locale; voiceId: string } }) => {
        if (d.settings) {
          if (d.settings.interviewerLocale && voiceByLocale[d.settings.interviewerLocale]) {
            if(!scriptLocale){
              setInterviewerLocale(d.settings.interviewerLocale);
              setVoice(d.settings.voiceId || voiceByLocale[d.settings.interviewerLocale][0]);
            }
          }
          if (d.settings.candidateSttLocale && voiceByLocale[d.settings.candidateSttLocale]) {
            setCandidateLocale(d.settings.candidateSttLocale);
          }
        }
      })
      .catch(() => {});
  }, [scriptLocale]);

  function onInterviewerLocaleChange(val: Locale) {
    setInterviewerLocale(val);
    setVoice(voiceByLocale[val][0]);
  }

  async function testSpeaker() {
    try {
      setDeviceNotice("Testing speaker: playing tone...");
      await checkSpeaker();
      setSpeakerOk(true);
      setDeviceNotice("✓ Speaker test passed (tone played).");
    } catch (e) {
      setSpeakerOk(false);
      setDeviceNotice(e instanceof Error ? e.message : "Speaker test failed.");
    }
  }

  async function testMicrophone() {
    try {
      setDeviceNotice("Testing microphone: requesting browser permission...");
      await checkMicrophone();
      setMicOk(true);
      setDeviceNotice("✓ Microphone access verified; audio tracks stopped.");
    } catch (e) {
      setMicOk(false);
      setDeviceNotice(e instanceof Error ? e.message : "Microphone test failed.");
    }
  }

  function previewVoice() {
    if (typeof window === "undefined") return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const phrase =
        interviewerLocale === "vi-VN"
          ? "Xin chào! Đây là bản nghe thử giọng nói của người phỏng vấn."
          : "Hello! This is a preview of the interviewer voice.";
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = interviewerLocale;
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.startsWith(interviewerLocale.split("-")[0]));
      if (match) utterance.voice = match;
      setVoicePlaying(true);
      utterance.onend = () => setVoicePlaying(false);
      utterance.onerror = () => setVoicePlaying(false);
      window.speechSynthesis.speak(utterance);
      setDeviceNotice(`✓ Playing voice preview in ${interviewerLocale}.`);
    } else {
      setDeviceNotice("Speech synthesis is not supported by your browser.");
    }
  }

  async function approveScenario() {
    if (!scenario) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/demo/scenarios/${scenario.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", expectedRevision: scenario.latestRevision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");
      setScenario(data);
      setNotice("Revision approved! You can now start the interview meeting.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  async function startMeeting(mode: "demo" | "live" = "demo") {
    if (!scenario) return setError("Scenario not loaded");
    const latest = scenario.revisions.find((r) => r.revision === scenario.latestRevision);
    if (!latest?.approvedAt) {
      setError("Approve the latest scenario version before starting.");
      return;
    }
    if (!consent) {
      setError("You must explicitly consent to transcript retention.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (!requestKeyRef.current) requestKeyRef.current = crypto.randomUUID();
      const endpoint = mode === "live" ? "/api/live/sessions" : "/api/demo/sessions";
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          revision: scenario.latestRevision,
          requestKey: requestKeyRef.current,
          speech: {
            interviewerLocale,
            interviewerVoiceId: voice,
            candidateSttLocale: candidateLocale,
            consentToTranscript: consent,
          },
        }),
      });
      const data: Session & { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start interview session");

      requestKeyRef.current = null;
      if (mode === "live") {
        router.push(`/live?step=meeting&sessionId=${data.id}`);
      } else {
        router.push(`/demo?screen=meeting&sessionId=${data.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start meeting");
    } finally {
      setBusy(false);
    }
  }

  const approved = !!scenario?.revisions.find((r) => r.revision === scenario.latestRevision)?.approvedAt;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          ◉ <strong>Interview<br />Simulation</strong>
        </div>
        <div className="side-caption">MEETING PREFLIGHT</div>
        <nav aria-label="Preflight navigation">
          <Link href={`/scenarios/${scenarioId}`} className="live-entry">← Back to Scenario</Link>
          <Link href={`/live?step=preflight&scenarioId=${scenarioId}`} className="live-entry">✦ AI Interview (Live) →</Link>
          <Link href="/settings" style={{ color: "white", padding: 14 }}>⚙ AI Settings</Link>
          <Link href="/demo?screen=scenario" style={{ color: "white", padding: 14 }}>⌂ All Scenarios</Link>
        </nav>
        <div className="sidebar-bottom">
          <small>Scenario ID: {scenarioId.slice(0, 8)}…</small>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span className="eyebrow">PREFLIGHT CHECK</span>
            <span className="muted">/</span>
            <Link href={`/scenarios/${scenarioId}`} style={{ color: "inherit", textDecoration: "none" }}>
              <span className="small muted">{scenario?.role || scenarioId}</span>
            </Link>
          </div>
          <div className="user-bar">
            <small>{userEmail}</small>
            <button className="btn quiet" onClick={async () => { await client.signOut(); window.location.assign("/signin"); }}>
              Sign out
            </button>
          </div>
        </header>

        <main className="page">
          {error && <div className="alert error" role="alert">{error}</div>}
          {notice && (
            <div className="alert info" role="status">
              {notice}
              <button className="dismiss" onClick={() => setNotice("")}>×</button>
            </div>
          )}

          {loading ? (
            <div className="panel"><p>Loading scenario preflight…</p></div>
          ) : !scenario ? (
            <div className="panel">
              <h2>Scenario not found</h2>
              <p className="muted">Could not find scenario with ID: {scenarioId}</p>
              <Link href="/demo?screen=scenario" className="btn primary">← Back to Scenarios</Link>
            </div>
          ) : (
            <section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <p className="eyebrow" style={{ margin: 0 }}>04 / Meeting preflight</p>
                  <h1 style={{ margin: "4px 0 0" }}>Choose language, voice & devices</h1>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="pill" style={{ background: approved ? "#e6fffa" : "#fff5f5", color: approved ? "#234e52" : "#c53030" }}>
                    {approved ? "✓ Approved" : "Draft"} v{scenario.latestRevision}
                  </span>
                  <Link href={`/scenarios/${scenario.id}`} className="btn quiet small">
                    View scenario details →
                  </Link>
                </div>
              </div>

              <p className="lead">
                All three settings are independent. Changing the interviewer output language never changes your microphone input language.
              </p>

              <div className="cols">
                <div className="panel form-grid">
                  <label>
                    AI interviewer language
                    <select value={scriptLocale||interviewerLocale} disabled={scriptLocale!==null} onChange={(e) => onInterviewerLocaleChange(e.target.value as Locale)}>
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="vi-VN">Tiếng Việt</option>
                    </select>
                  </label>

                  {scriptLocale&&<p className="muted small">Approved script language: {scriptLocale}. To change it, update Default interviewer language in Settings and generate a new revision.</p>}
                  <label>
                    AI interviewer voice
                    <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                      {voiceByLocale[interviewerLocale].map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </label>

                  <button className="btn secondary" type="button" onClick={previewVoice} disabled={voicePlaying}>
                    {voicePlaying ? "🔊 Playing voice..." : "▶ Preview voice (mock)"}
                  </button>

                  <label>
                    Your microphone input language
                    <select value={candidateLocale} onChange={(e) => setCandidateLocale(e.target.value as Locale)}>
                      <option value="en-US">English (US)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="vi-VN">Tiếng Việt</option>
                    </select>
                  </label>

                  <p className="soft-notice">
                    Scripted interviewer questions in {interviewerLocale}. Candidate input locale: {candidateLocale}. No silent translation.
                  </p>

                  <label className="check" style={{ marginTop: "8px" }}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    I explicitly consent to save this practice transcript and workflow evidence on this self-hosted server.
                  </label>
                  <p className="muted small" style={{ margin: "-6px 0 12px" }}>
                    No raw audio is recorded. Your practice data remains in SQLite until you remove it.
                  </p>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "8px" }}>
                    <button
                      className="btn primary"
                      disabled={!approved || !consent || busy}
                      onClick={() => startMeeting("demo")}
                    >
                      {busy ? "Starting..." : "Start Demo meeting →"}
                    </button>
                    <button
                      className="btn secondary"
                      disabled={!approved || !consent || busy}
                      onClick={() => startMeeting("live")}
                      style={{ background: approved && consent ? "#059669" : undefined, borderColor: approved && consent ? "#047857" : undefined, color: approved && consent ? "#fff" : undefined }}
                    >
                      {busy ? "Starting..." : "Start AI Live meeting →"}
                    </button>
                  </div>

                  {!approved && (
                    <div style={{ marginTop: "12px", padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px" }}>
                      <p className="error" role="status" style={{ margin: "0 0 8px" }}>
                        Approve the latest scenario version before starting.
                      </p>
                      <button className="btn secondary small" onClick={approveScenario} disabled={busy}>
                        ✓ Approve revision v{scenario.latestRevision} now
                      </button>
                    </div>
                  )}
                  {approved && !consent && (
                    <p className="muted small" style={{ color: "#d97706", marginTop: "8px" }}>
                      ⚠️ Please check the consent box above to enable meeting start.
                    </p>
                  )}
                </div>

                <div className="panel">
                  <h2>Device check</h2>
                  <div className="device-row">
                    <button className="btn secondary" type="button" onClick={testMicrophone}>
                      🎙 Test mic {micOk ? "✓" : "(mock)"}
                    </button>
                    <button className="btn secondary" type="button" onClick={testSpeaker}>
                      🔊 Test speaker {speakerOk ? "✓" : "(mock)"}
                    </button>
                  </div>
                  {deviceNotice && <p className="soft-notice" style={{ marginTop: "12px" }}>{deviceNotice}</p>}

                  <h3>Meeting policy</h3>
                  <p>Half-duplex · typed-answer fallback · scripted interviewer</p>
                  <p>Raw audio: <b>off</b></p>
                  <p>
                    Scenario: <b>{scenario.role}</b> {approved ? <span style={{ color: "#16a34a" }}>✓ approved</span> : <span style={{ color: "#dc2626" }}>not approved</span>}
                  </p>

                  <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid #e2e8f0" }} />

                  <h4>Scenario quick summary</h4>
                  <p style={{ margin: "4px 0" }}><b>Focus:</b> {scenario.focus || "Not specified"}</p>
                  <p style={{ margin: "8px 0", fontSize: "13px", color: "#64748b", maxHeight: "140px", overflow: "auto", background: "#f8fafc", padding: "10px", borderRadius: "6px", border: "1px solid #e2e8f0", whiteSpace: "pre-wrap" }}>
                    {scenario.jobDescription}
                  </p>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
