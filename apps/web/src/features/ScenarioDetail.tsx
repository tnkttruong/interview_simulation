"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createAuthClient } from "better-auth/react";
import { extractPdf } from "./pdf-client";
import BilingualPlanTables,{type PlanReviewData} from "./BilingualPlanTables";

type Revision = { revision: number; approvedAt: number | null; notes: string };
type Scenario = {
  id: string;
  role: string;
  jobDescription: string;
  focus: string;
  latestRevision: number;
  revisions: Revision[];
};
type Plan = PlanReviewData;

const client = createAuthClient();

export default function ScenarioDetail({
  scenarioId,
  userEmail,
}: {
  scenarioId: string;
  userEmail: string;
}) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cvText, setCvText] = useState("");
  const [cvFilename, setCvFilename] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editRole, setEditRole] = useState("");
  const [editFocus, setEditFocus] = useState("");
  const [editJd, setEditJd] = useState("");
  const [editCvText, setEditCvText] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planMessage, setPlanMessage] = useState("");

  const loadScenario = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      let sc: Scenario | null = null;
      // Try live scenarios endpoint first
      const liveRes = await fetch(`/api/live/scenarios/${scenarioId}`, { credentials: "same-origin" });
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        if (liveData.scenario) {
          sc = liveData.scenario;
          setScenario(liveData.scenario);
          if (liveData.plan) setPlan(liveData.plan);
          if (liveData.cvText) setCvText(liveData.cvText);
          if (liveData.cvFilename) setCvFilename(liveData.cvFilename);
        }
      }
      if (!sc) {
        const demoRes = await fetch(`/api/demo/scenarios/${scenarioId}`, { credentials: "same-origin" });
        if (!demoRes.ok) throw new Error("Scenario not found");
        const demoData = await demoRes.json();
        sc = demoData;
        setScenario(demoData);
      }
      if (sc) {
        setEditRole(sc.role);
        setEditFocus(sc.focus);
        setEditJd(sc.jobDescription);
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
    if (scenario?.id && typeof window !== "undefined") {
      sessionStorage.setItem("last_scenario_id", scenario.id);
    }
  }, [scenario]);

  async function upload(file: File, target: "cv" | "jd") {
    setBusy(true);
    setError("");
    try {
      if (file.size > 4 * 1024 * 1024) throw new Error("File limit is 4 MB");
      let content: string;
      if (file.name.toLowerCase().endsWith(".pdf")) content = await extractPdf(file);
      else {
        const data = new FormData();
        data.append("file", file);
        const res = await fetch("/api/live/cv", { method: "POST", body: data, credentials: "same-origin" });
        const parsed = await res.json();
        if (!res.ok) throw new Error(parsed.error || "File extraction failed");
        content = parsed.cvText;
      }
      if (target === "cv") {
        setEditCvText(content);
        setCvFilename(file.name);
        setNotice(`Extracted ${content.length} characters from ${file.name} into CV.`);
      } else {
        setEditJd(content);
        setNotice(`Extracted ${content.length} characters from ${file.name} into Job Description.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload extraction failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveUpdate() {
    if (!scenario) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/live/scenarios/${scenario.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          focus: editFocus,
          jobDescription: editJd,
          ...(editCvText ? { cvText: editCvText, cvFilename: cvFilename || "candidate-cv.txt" } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update scenario");
      if (data.scenario) {
        setScenario(data.scenario);
        if (data.plan) setPlan(data.plan);
        if (data.cvText) setCvText(data.cvText);
        if (data.cvFilename) setCvFilename(data.cvFilename);
      } else {
        setScenario(data);
      }
      setIsEditing(false);
      setNotice("Scenario details updated successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save update");
    } finally {
      setBusy(false);
    }
  }

  async function startPlanningReviewScript(instruction?: string) {
    if (!scenario) return;
    setBusy(true);
    setError("");
    setNotice("Calling AI to plan interview script (questions & rubric)...");
    try {
      const res = await fetch(`/api/live/scenarios/${scenario.id}/plan`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(cvText ? { cvText } : {}),
          ...(instruction?.trim() ? { instruction: instruction.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to plan scenario");
      if (data.scenario) setScenario(data.scenario);
      if (data.plan) setPlan(data.plan);
      if (data.cvText) setCvText(data.cvText);
      if (data.cvFilename) setCvFilename(data.cvFilename);
      setShowPlanModal(false);
      setPlanMessage("");
      setNotice("Interview review script and evaluation rubric planned successfully!");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed");
    } finally {
      setBusy(false);
    }
  }

  async function approveRevision() {
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
      setNotice("Revision approved! You can now start interview preflight.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setBusy(false);
    }
  }

  async function createRevision(customNotes?: string) {
    const feedbackText = (customNotes !== undefined ? customNotes : revisionNotes).trim();
    if (!scenario || !feedbackText) return;
    setBusy(true);
    setError("");
    setNotice("Calling AI to revise interview script based on your message...");
    try {
      let res;
      if (plan) {
        res = await fetch(`/api/live/scenarios/${scenario.id}/revise`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: feedbackText, expectedRevision: scenario.latestRevision }),
        });
      } else {
        res = await fetch(`/api/demo/scenarios/${scenario.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "revise", notes: feedbackText, expectedRevision: scenario.latestRevision }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create revision");
      await loadScenario();
      setRevisionNotes("");
      setPlanMessage("");
      setShowPlanModal(false);
      setNotice("New draft revision created per your request. Approval is required before starting.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revision failed");
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
        <div className="side-caption">SCENARIO DETAIL</div>
        <nav aria-label="Scenario navigation">
          <Link href="/?screen=scenario" className="live-entry">← Back to Workspace</Link>
          <Link href="/live" className="live-entry">✦ AI Interview (P1–P3) →</Link>
          <Link href="/settings" style={{ color: "white", padding: 14 }}>⚙ AI Settings</Link>
          <Link href="/" style={{ color: "white", padding: 14 }}>⌂ Home Dashboard</Link>
        </nav>
        <div className="sidebar-bottom">
          <small>Scenario ID: {scenarioId.slice(0, 8)}…</small>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span className="eyebrow">SCENARIO DETAILS</span>
            <span className="muted">/</span>
            <span className="small muted">{scenarioId}</span>
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
            <div className="panel"><p>Loading scenario details…</p></div>
          ) : !scenario ? (
            <div className="panel">
              <h2>Scenario not found</h2>
              <p className="muted">Could not find scenario with ID: {scenarioId}</p>
              <Link href="/?screen=scenario" className="btn primary">← Back to Scenarios</Link>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                <div>
                  <h1 style={{ margin: "0 0 6px" }}>{scenario.role}</h1>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className="pill">{approved ? "✓ Approved" : "Draft"} v{scenario.latestRevision}</span>
                    <span className="muted small">{scenario.revisions.length} total revision(s)</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {!isEditing && (
                    <button
                      className="btn secondary"
                      onClick={() => {
                        setEditRole(scenario.role);
                        setEditFocus(scenario.focus);
                        setEditJd(scenario.jobDescription);
                        setEditCvText(cvText);
                        setIsEditing(true);
                      }}
                      disabled={busy}
                    >
                      ✏ Edit details
                    </button>
                  )}
                  <button
                    className="btn primary"
                    onClick={() => setShowPlanModal(true)}
                    disabled={busy}
                    style={{ background: "#4338ca", borderColor: "#3730a3", color: "#fff" }}
                  >
                    {busy ? "⏳ Đang gọi AI..." : plan ? "✦ Lên lại kịch bản (AI)" : "✦ Bắt đầu tạo kịch bản (AI)"}
                  </button>
                  {approved ? (
                    <Link href={`/scenarios/${scenario.id}/preflight`} className="btn primary">
                      Continue to preflight →
                    </Link>
                  ) : (
                    <button className="btn secondary" onClick={approveRevision} disabled={busy}>
                      ✓ Approve revision v{scenario.latestRevision}
                    </button>
                  )}
                  <Link href={`/?screen=scenario&scenarioId=${scenario.id}`} className="btn quiet">
                    All scenarios
                  </Link>
                </div>
              </div>

              <div className="cols">
                <div className="panel">
                  {isEditing ? (
                    <div className="form-grid">
                      <h3>Edit scenario details</h3>
                      <label>
                        Role
                        <input value={editRole} maxLength={180} onChange={(e) => setEditRole(e.target.value)} disabled={busy} />
                      </label>
                      <label>
                        Tech stack / focus
                        <input value={editFocus} maxLength={1500} onChange={(e) => setEditFocus(e.target.value)} disabled={busy} />
                      </label>
                      <label>
                        Upload new Job description (PDF, DOCX, TXT, MD; ≤4 MB)
                        <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "jd"); }} />
                      </label>
                      <label>
                        Job description
                        <textarea rows={7} value={editJd} maxLength={20000} onChange={(e) => setEditJd(e.target.value)} disabled={busy} />
                      </label>
                      <label>
                        Upload new CV (optional file: PDF, DOCX, TXT, MD; ≤4 MB)
                        <input type="file" accept=".pdf,.docx,.txt,.md" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, "cv"); }} />
                      </label>
                      <label>
                        CV text
                        <textarea
                          rows={5}
                          value={editCvText}
                          placeholder="Paste or upload candidate CV text here..."
                          maxLength={30000}
                          onChange={(e) => setEditCvText(e.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn primary" onClick={saveUpdate} disabled={busy || editRole.trim().length < 3 || editJd.trim().length < 10}>
                          Save update
                        </button>
                        <button className="btn secondary" onClick={() => setIsEditing(false)} disabled={busy}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h2>Scenario overview</h2>
                      <p><b>Focus:</b> {scenario.focus || "Not specified"}</p>
                      <h3>Job Description</h3>
                      <p style={{ whiteSpace: "pre-wrap", background: "#f8fafd", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                        {scenario.jobDescription}
                      </p>

                      <h3>Candidate CV</h3>
                      {cvText ? (
                        <>
                          <small className="muted">{cvFilename || "Attached CV"}</small>
                          <p style={{ whiteSpace: "pre-wrap", background: "#f8fafd", padding: "14px", borderRadius: "8px", border: "1px solid #e2e8f0", maxHeight: "200px", overflow: "auto" }}>
                            {cvText}
                          </p>
                        </>
                      ) : (
                        <div style={{ margin: "10px 0 18px", padding: "12px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", fontSize: "13px", color: "#64748b" }}>
                          ℹ️ Chưa có CV ứng viên cho kịch bản này. Bạn có thể nhấn <b>✏ Edit details</b> để tải lên hoặc dán nội dung CV, hoặc có thể tạo kịch bản trực tiếp từ JD.
                        </div>
                      )}

                      <hr style={{ margin: "24px 0", border: 0, borderTop: "1px solid #e2e8f0" }} />

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                        <h3 style={{ margin: 0 }}>Interview stages & questions</h3>
                        {!plan && (
                          <button className="btn primary small" onClick={() => setShowPlanModal(true)} disabled={busy}>
                            ✦ Bắt đầu tạo kịch bản
                          </button>
                        )}
                      </div>

                      {!plan ? (
                        <div style={{ padding: "20px", background: "#f0f7ff", borderRadius: "10px", border: "1px dashed #b8d2f2", margin: "14px 0" }}>
                          <h4 style={{ margin: "0 0 6px", color: "#1e40af" }}>Chưa có kịch bản phỏng vấn chi tiết</h4>
                          <p style={{ margin: "0 0 14px", color: "#3b82f6", fontSize: "14px", lineHeight: "1.5" }}>
                            Scenario này hiện mới chỉ có thông tin vị trí và JD, chưa được AI lên danh sách câu hỏi cụ thể theo từng giai đoạn và tiêu chí chấm điểm (rubric).
                          </p>
                          <button
                            className="btn primary"
                            onClick={() => setShowPlanModal(true)}
                            disabled={busy}
                            style={{ padding: "10px 20px", fontWeight: 600, background: "#3b82f6", borderColor: "#2563eb" }}
                          >
                            {busy ? "⏳ Đang gọi AI lên kịch bản..." : "✦ Bắt đầu tạo kịch bản với AI"}
                          </button>
                        </div>
                      ) : (
                        <div style={{ marginTop: "12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <span className="pill" style={{ background: "#e0e7ff", color: "#3730a3" }}>{plan.role} · {plan.level}</span>
                            <button className="btn quiet small" onClick={() => setShowPlanModal(true)} disabled={busy} style={{ fontSize: "12px" }}>
                              ↺ Lên lại kịch bản
                            </button>
                          </div>
                          {plan.bilingual ? <BilingualPlanTables plan={plan}/> : <>
                          <p><b>Overview:</b> {plan.overview}</p>
                          <ol>
                            {plan.stages.map((st, i) => (
                              <li key={i} style={{ marginBottom: "14px" }}>
                                <b>{st.topic}</b>
                                <ul style={{ marginTop: "4px" }}>
                                  {st.questions.map((q, qi) => (
                                    <li key={qi} style={{ margin: "4px 0" }}>{q}{st.suggestedAnswers?.[qi] && <details><summary>Suggested answer</summary><p>{st.suggestedAnswers[qi]}</p></details>}</li>
                                  ))}
                                </ul>
                              </li>
                            ))}
                          </ol>

                          {plan.rubric && plan.rubric.length > 0 && (
                            <>
                              <h4 style={{ marginTop: "20px", marginBottom: "8px" }}>Tiêu chí đánh giá (Rubric)</h4>
                              <ul style={{ listStyleType: "none", paddingLeft: 0, display: "grid", gap: "8px" }}>
                                {plan.rubric.map((r, ri) => (
                                  <li key={ri} style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                                    <strong style={{ color: "#1e293b" }}>{r.competency}:</strong> <span style={{ color: "#475569" }}>{r.criteria}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                          </>}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="panel">
                  <h2>Revision history</h2>
                  <p className="muted small">Approved revisions are immutable snapshots. Requesting changes creates a new draft revision.</p>
                  <div style={{ display: "grid", gap: "10px", marginBottom: "18px" }}>
                    {scenario.revisions.map((r) => (
                      <div key={r.revision} className="chat-bubble" style={{ borderLeft: r.approvedAt ? "4px solid #48bb78" : "4px solid #cbd5e0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <strong>Revision v{r.revision}</strong>
                          {r.approvedAt ? (
                            <span className="pill" style={{ background: "#e6fffa", color: "#234e52" }}>✓ Approved</span>
                          ) : (
                            <span className="pill">Draft</span>
                          )}
                        </div>
                        <p style={{ margin: "8px 0 0" }}>{r.notes || "Initial scenario creation."}</p>
                      </div>
                    ))}
                  </div>

                  <h3>Request new revision</h3>
                  <label>
                    Revision notes
                    <textarea
                      placeholder="Ask to emphasize system design, concurrency, communication..."
                      rows={4}
                      maxLength={1000}
                      value={revisionNotes}
                      onChange={(e) => setRevisionNotes(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <button className="btn secondary" disabled={busy || !revisionNotes.trim()} onClick={() => createRevision()}>
                    Create unapproved revision
                  </button>
                </div>
              </div>

              {showPlanModal && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(15, 23, 42, 0.65)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                    padding: "16px",
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget && !busy) setShowPlanModal(false);
                  }}
                >
                  <div
                    style={{
                      background: "#ffffff",
                      borderRadius: "14px",
                      boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                      maxWidth: "580px",
                      width: "100%",
                      padding: "24px",
                      position: "relative",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                      <div>
                        <h2 style={{ margin: "0 0 4px", fontSize: "1.2rem", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#4f46e5" }}>✦</span> {plan ? "Lên lại kịch bản với AI Agent" : "Tạo kịch bản phỏng vấn với AI"}
                        </h2>
                        <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                          {plan
                            ? "Điền tin nhắn/yêu cầu sửa đổi để AI Agent chỉnh sửa kịch bản theo ý bạn (tạo revision mới), hoặc chọn sinh mới lại hoàn toàn."
                            : "AI Agent sẽ phân tích JD & CV để thiết kế câu hỏi phỏng vấn và tiêu chí rubric tương ứng."}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowPlanModal(false)}
                        disabled={busy}
                        style={{
                          background: "transparent",
                          border: "none",
                          fontSize: "20px",
                          color: "#94a3b8",
                          cursor: "pointer",
                          padding: "4px 8px",
                          borderRadius: "4px",
                        }}
                        aria-label="Đóng"
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                      <label style={{ display: "block", fontWeight: 600, fontSize: "13px", color: "#334155", marginBottom: "6px" }}>
                        Tin nhắn / Yêu cầu cho AI Agent {plan ? "(Tùy chọn chỉnh sửa)" : "(Ghi chú tùy chọn)"}:
                      </label>
                      <textarea
                        rows={4}
                        maxLength={1000}
                        value={planMessage}
                        onChange={(e) => setPlanMessage(e.target.value)}
                        disabled={busy}
                        placeholder={
                          plan
                            ? "Ví dụ: Hỏi sâu hơn về System Design và Concurrency; thêm tình huống xử lý sự cố Production; giảm câu hỏi lý thuyết cơ bản..."
                            : "Ví dụ: Nhấn mạnh kỹ năng làm việc với Distributed Systems, Redis và Docker..."
                        }
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          borderRadius: "8px",
                          border: "1px solid #cbd5e1",
                          padding: "10px 12px",
                          fontSize: "14px",
                          lineHeight: "1.5",
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Gợi ý nhanh (nhấn vào để điền):</span>
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>{planMessage.length}/1000</span>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                        {[
                          "✦ Hỏi sâu System Design & Concurrency",
                          "✦ Thêm tình huống xử lý sự cố Production",
                          "✦ Bám sát các dự án thực tế trong CV",
                          "✦ Đào sâu kỹ năng tối ưu DB & Caching",
                        ].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setPlanMessage((prev) => {
                                const cleaned = tag.replace("✦ ", "");
                                return prev ? `${prev}. ${cleaned}` : cleaned;
                              });
                            }}
                            style={{
                              fontSize: "11px",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "14px",
                              padding: "4px 10px",
                              cursor: "pointer",
                              color: "#475569",
                            }}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap", marginTop: "20px" }}>
                      <button
                        type="button"
                        className="btn quiet"
                        onClick={() => setShowPlanModal(false)}
                        disabled={busy}
                      >
                        Hủy
                      </button>

                      {plan ? (
                        <>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => startPlanningReviewScript(planMessage)}
                            disabled={busy}
                            title="Tạo mới kịch bản hoàn toàn dựa trên JD, CV và tin nhắn"
                          >
                            {busy ? "⏳ Đang tạo..." : "↺ Sinh mới lại từ đầu"}
                          </button>
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => createRevision(planMessage)}
                            disabled={busy || !planMessage.trim()}
                            style={{ background: "#4338ca", borderColor: "#3730a3" }}
                            title="AI sẽ giữ lại các phần tốt và sửa kịch bản theo tin nhắn của bạn (tạo revision mới)"
                          >
                            {busy ? "⏳ Đang cập nhật..." : "✦ Gửi yêu cầu sửa kịch bản"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => startPlanningReviewScript(planMessage)}
                          disabled={busy}
                          style={{ background: "#4338ca", borderColor: "#3730a3" }}
                        >
                          {busy ? "⏳ Đang tạo..." : "✦ Bắt đầu tạo kịch bản"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
