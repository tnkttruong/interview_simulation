"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createAuthClient } from "better-auth/react";

type Turn = {
  id: string;
  sequence: number;
  question: string;
  answer: string;
  answerSource: string;
  originalStt: string | null;
  createdAt?: number;
};

type Session = {
  id: string;
  scenarioId: string;
  scenarioRevision: number;
  state: string;
  version: number;
  createdAt: number;
  speechConfig: string;
  mode?: string;
  scenario?: { role: string; focus: string };
  turns?: Turn[];
};

type Event = {
  id: string;
  seq: number;
  type: string;
  timestamp: number;
  metadata: string;
};

const client = createAuthClient();
const toDate = (ts: number) => new Date(ts).toLocaleString();

export default function SessionDetail({
  sessionId,
  userEmail,
}: {
  sessionId: string;
  userEmail: string;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"transcript" | "events">("transcript");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/demo/sessions/${sessionId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Session not found");
      const data = await res.json();
      setSession(data);

      setLoadingEvents(true);
      const evRes = await fetch(`/api/demo/sessions/${sessionId}?include=events`, { credentials: "same-origin" });
      if (evRes.ok) {
        setEvents(await evRes.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoading(false);
      setLoadingEvents(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  let parsedSpeech: { interviewerLocale?: string; interviewerVoiceId?: string; candidateSttLocale?: string } = {};
  try {
    if (session?.speechConfig) parsedSpeech = JSON.parse(session.speechConfig);
  } catch {}

  const stateColors: Record<string, { bg: string; text: string }> = {
    COMPLETED: { bg: "#e6fffa", text: "#234e52" },
    IN_PROGRESS: { bg: "#ebf8ff", text: "#2b6cb0" },
    PAUSED: { bg: "#fefcbf", text: "#744210" },
    INTERRUPTED: { bg: "#fed7d7", text: "#9b2c2c" },
  };
  const color = (session && stateColors[session.state]) || { bg: "#edf2f7", text: "#4a5568" };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          ◉ <strong>Interview<br />Simulation</strong>
        </div>
        <div className="side-caption">SESSION DETAIL & AUDIT</div>
        <nav aria-label="Session navigation">
          <Link href="/?screen=history" className="live-entry">← Back to Sessions</Link>
          <Link href="/live" className="live-entry">✦ AI Interview (P1–P3) →</Link>
          <Link href="/settings" style={{ color: "white", padding: 14 }}>⚙ AI Settings</Link>
          <Link href="/" style={{ color: "white", padding: 14 }}>⌂ Home Dashboard</Link>
        </nav>
        <div className="sidebar-bottom">
          <small>Session ID: {sessionId.slice(0, 8)}…</small>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span className="eyebrow">SESSION AUDIT</span>
            <span className="muted">/</span>
            <span className="small muted">{sessionId}</span>
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

          {loading ? (
            <div className="panel"><p>Loading session data…</p></div>
          ) : !session ? (
            <div className="panel">
              <h2>Session not found</h2>
              <p className="muted">No session found with ID: {sessionId}</p>
              <Link href="/?screen=history" className="btn primary">← Back to History</Link>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h1 style={{ margin: "0 0 6px" }}>{session.scenario?.role || "Interview Session"}</h1>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <span className="pill" style={{ background: color.bg, color: color.text }}>
                      {session.state}
                    </span>
                    <span className="pill">Mode: {session.mode || "demo"}</span>
                    <span className="muted small">Created: {toDate(session.createdAt)}</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {session.scenarioId && (
                    <Link href={`/scenarios/${session.scenarioId}`} className="btn secondary">
                      View scenario details →
                    </Link>
                  )}
                  {session.state === "IN_PROGRESS" && (
                    <Link
                      href={session.mode === "live" ? `/live?step=meeting&sessionId=${session.id}` : `/?screen=meeting&sessionId=${session.id}`}
                      className="btn primary"
                    >
                      Join live meeting →
                    </Link>
                  )}
                  {(session.state === "PAUSED" || session.state === "INTERRUPTED") && (
                    <Link
                      href={session.mode === "live" ? `/live?step=meeting&sessionId=${session.id}` : `/?screen=paused&sessionId=${session.id}`}
                      className="btn primary"
                    >
                      Resume session →
                    </Link>
                  )}
                  <Link href="/?screen=new" className="btn quiet">
                    + Start new interview
                  </Link>
                </div>
              </div>

              <div className="stats" style={{ marginBottom: "20px" }}>
                <article className="panel">
                  <span>Recorded turns</span>
                  <strong>{session.turns?.length || 0}</strong>
                </article>
                <article className="panel">
                  <span>Scenario revision</span>
                  <strong>v{session.scenarioRevision}</strong>
                </article>
                <article className="panel">
                  <span>Workflow events</span>
                  <strong>{events.length}</strong>
                </article>
              </div>

              <div className="panel" style={{ marginBottom: "20px" }}>
                <h2>Language & Voice Configuration</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
                  <div>
                    <span className="muted small">Interviewer Language</span>
                    <p style={{ margin: "4px 0", fontWeight: 600 }}>{parsedSpeech.interviewerLocale || "en-US"}</p>
                  </div>
                  <div>
                    <span className="muted small">Interviewer Voice ID</span>
                    <p style={{ margin: "4px 0", fontWeight: 600 }}>{parsedSpeech.interviewerVoiceId || "Standard"}</p>
                  </div>
                  <div>
                    <span className="muted small">Candidate Input (STT)</span>
                    <p style={{ margin: "4px 0", fontWeight: 600 }}>{parsedSpeech.candidateSttLocale || "vi-VN"}</p>
                  </div>
                  <div>
                    <span className="muted small">Tech stack / focus</span>
                    <p style={{ margin: "4px 0", fontWeight: 600 }}>{session.scenario?.focus || "General"}</p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button
                  className={`btn ${tab === "transcript" ? "primary" : "secondary"}`}
                  onClick={() => setTab("transcript")}
                >
                  Transcript ({(session.turns || []).length} turns)
                </button>
                <button
                  className={`btn ${tab === "events" ? "primary" : "secondary"}`}
                  onClick={() => setTab("events")}
                >
                  Workflow audit events ({events.length})
                </button>
              </div>

              {tab === "transcript" ? (
                <div className="panel transcript">
                  <h2>Interview Transcript</h2>
                  {(!session.turns || session.turns.length === 0) ? (
                    <p className="muted">No answers have been recorded for this session.</p>
                  ) : (
                    session.turns.map((t) => (
                      <div className="turn" key={t.id} style={{ padding: "16px 0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                          <strong>Q{t.sequence} · Interviewer</strong>
                          <span className="pill small">{t.answerSource}</span>
                        </div>
                        <p style={{ fontSize: "16px", margin: "6px 0 14px", color: "#1a202c" }}>{t.question}</p>
                        <strong style={{ color: "#4c51bf" }}>Candidate answer:</strong>
                        <p style={{ background: "#f7fafc", padding: "12px", borderRadius: "8px", margin: "6px 0 8px", whiteSpace: "pre-wrap" }}>
                          {t.answer}
                        </p>
                        {t.originalStt && t.originalStt !== t.answer && (
                          <p className="muted small">
                            Original STT: <i>{t.originalStt}</i> (user corrected)
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="panel">
                  <h2>Workflow & Evidence Events</h2>
                  <p className="muted small">Sanitized timeline of lifecycle events recorded for verification and compliance.</p>
                  {loadingEvents ? (
                    <p>Loading events…</p>
                  ) : events.length === 0 ? (
                    <p className="muted">No events recorded for this session.</p>
                  ) : (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {events.map((e) => (
                        <div key={e.id} className="event" style={{ padding: "12px 0" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span>
                              <b>#{e.seq}</b> · <span style={{ fontFamily: "monospace", color: "#2b6cb0" }}>{e.type}</span>
                            </span>
                            <span className="muted small">{toDate(e.timestamp)}</span>
                          </div>
                          {e.metadata && e.metadata !== "{}" && (
                            <pre style={{ margin: "8px 0 0", padding: "8px", background: "#f7fafc", borderRadius: "6px", fontSize: "12px", overflow: "auto" }}>
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(e.metadata), null, 2);
                                } catch {
                                  return e.metadata;
                                }
                              })()}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
