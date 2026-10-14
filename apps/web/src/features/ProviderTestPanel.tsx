"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { voiceByLocale } from "@interview/core";
import { checkMicrophone, checkSpeaker, listen, type SpeechCredential } from "./azure-client";

type Locale = keyof typeof voiceByLocale;
type CliProvider = "codex_cli" | "agy_cli";
type TestId = CliProvider | "azure_auth" | "azure_tts" | "mic" | "speaker" | "azure_stt";
type TestResult = { ok: boolean; detail: string; elapsedMs: number };
type Catalog = { available: boolean; models: string[] };
type Status = {
  enabled: boolean;
  ai: { cliEnabled: boolean; providers: { codex_cli: Catalog; agy_cli: Catalog } };
  azure: { configured: boolean; region: string | null };
  defaults: { provider: string; model: string; interviewerLocale: Locale; candidateSttLocale: Locale; voiceId: string };
};
type VoiceCatalog = { enabled: boolean; voices: Record<Locale, string[]> };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init });
  const body = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(body.error || "Request failed (HTTP " + res.status + ")");
  return body;
}

export default function ProviderTestPanel({ email }: { email: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [voices, setVoices] = useState<VoiceCatalog | null>(null);
  const [models, setModels] = useState<Record<CliProvider, string>>({ codex_cli: "", agy_cli: "" });
  const [locale, setLocale] = useState<Locale>("en-US");
  const [sttLocale, setSttLocale] = useState<Locale>("en-US");
  const [voice, setVoice] = useState<string>(voiceByLocale["en-US"][0]);
  const [running, setRunning] = useState<TestId | "load" | null>(null);
  const [results, setResults] = useState<Partial<Record<TestId, TestResult>>>({});
  const [transcript, setTranscript] = useState("");
  const [loadError, setLoadError] = useState("");
  const credential = useRef<{ value: SpeechCredential; expiry: number } | null>(null);

  async function reload() {
    setRunning("load");
    setLoadError("");
    try {
      const next = await request<Status>("/api/me/provider-tests");
      setStatus(next);
      setModels({
        codex_cli: next.defaults.provider === "codex_cli"
          ? next.defaults.model : next.ai.providers.codex_cli.models[0] || "",
        agy_cli: next.defaults.provider === "agy_cli"
          ? next.defaults.model : next.ai.providers.agy_cli.models[0] || "",
      });
      setLocale(next.defaults.interviewerLocale);
      setSttLocale(next.defaults.candidateSttLocale);
      setVoice(next.defaults.voiceId);
      try {
        const catalog = await request<VoiceCatalog>("/api/live/speech/voices");
        setVoices(catalog);
      } catch {
        setVoices(null); // The Azure catalog is optional; status and CLI tests still work.
      }
    } catch (e) { setLoadError(e instanceof Error ? e.message : "Unable to load test status"); }
    finally { setRunning(null); }
  }
  useEffect(() => { void reload(); }, []);

  async function run(testId: TestId, action: () => Promise<string>) {
    if (running) return;
    setRunning(testId);
    setResults(current => { const next = { ...current }; delete next[testId]; return next; });
    const start = performance.now();
    try {
      const detail = await action();
      setResults(current => ({ ...current, [testId]: { ok: true, detail, elapsedMs: Math.round(performance.now() - start) } }));
    } catch (e) {
      setResults(current => ({ ...current, [testId]: { ok: false,
        detail: e instanceof Error ? e.message : "Unknown error", elapsedMs: Math.round(performance.now() - start) } }));
    } finally { setRunning(null); }
  }
  const canRun = !!status?.enabled;
  const voiceOptions = (voices?.enabled ? voices.voices[locale] : undefined) || [...voiceByLocale[locale]];
  async function testCli(provider: CliProvider) {
    await run(provider, async () => {
      const res = await request<{ ok: boolean; durationMs: number }>("/api/me/provider-tests/cli", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, model: models[provider] }),
      });
      return "Authenticated CLI returned the expected JSON response (" + res.durationMs + " ms server time).";
    });
  }
  async function getCredential(): Promise<SpeechCredential> {
    if (credential.current && credential.current.expiry > Date.now() + 30_000)
      return credential.current.value;
    const token = await request<{ token: string; region: string; expiresIn: number }>(
      "/api/me/provider-tests/azure/token", { method: "POST" });
    credential.current = {
      value: { token: token.token, region: token.region },
      expiry: Date.now() + token.expiresIn * 1000,
    };
    return credential.current.value;
  }
  async function testTts() {
    await run("azure_tts", async () => {
      const response = await fetch("/api/live/speech/preview", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewerLocale: locale, voiceId: voice }),
      });
      if (!response.ok) throw new Error("Azure voice preview failed (HTTP " + response.status + ").");
      const url = URL.createObjectURL(await response.blob());
      try {
        const sound = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          sound.onended = () => resolve();
          sound.onerror = () => reject(new Error("Audio playback failed"));
          void sound.play().catch(reject);
        });
        return "Azure synthesized and played a sample using " + voice + ".";
      } finally { URL.revokeObjectURL(url); }
    });
  }
  const testStatus = (id: TestId) => {
    const result = results[id];
    return result ? <p role="status" className={result.ok ? "alert info" : "alert error"}>
      {result.ok ? "PASS" : "FAIL"} · {result.elapsedMs} ms — {result.detail}
    </p> : null;
  };
  const localeOptions = [
    { value: "en-US", label: "English (US)" }, { value: "en-GB", label: "English (UK)" },
    { value: "vi-VN", label: "Tiếng Việt" },
  ];
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">◉ <strong>Interview Simulation</strong></div>
      <div className="side-caption">PROVIDER DIAGNOSTICS</div>
      <nav aria-label="Workspace navigation">
        <Link className="live-entry" href="/settings">← AI settings</Link>
        <Link className="live-entry" href="/live">✦ AI Interview</Link>
        <Link className="live-entry" href="/">Offline demo</Link>
      </nav>
      <div className="sidebar-bottom">Real CLI and Azure tests may incur provider charges. Use only on a trusted self-hosted server.</div>
    </aside>
    <div className="main-area">
      <header className="topbar"><span className="eyebrow">PROVIDER HEALTH CHECK</span><small>{email}</small></header>
      <main className="page">
        <h1>Test AI and Azure providers</h1>
        <p className="lead">Run a fixed prompt through Codex or Agy, then verify Azure credentials, speaker, microphone and speech recognition without creating an interview.</p>
        {loadError && <p role="alert" className="alert error">{loadError}</p>}
        <div className="device-row" style={{ marginBottom: 18 }}>
          <button className="btn secondary" disabled={!!running} onClick={() => void reload()}>Refresh status</button>
          <span className="pill">{!status ? "Loading" : status.enabled ? "Diagnostics enabled" : "Diagnostics disabled"}</span>
        </div>
        {status && !canRun && <p role="alert" className="alert error">
          Set <code>ENABLE_PROVIDER_TESTS=true</code> in the server environment and restart the app to enable live checks.
          The default is off to avoid exposing paid provider tests to public accounts.
        </p>}
        <div className="cols">
          {(["codex_cli", "agy_cli"] as const).map(provider => {
            const name = provider === "codex_cli" ? "Codex CLI" : "Agy CLI";
            const catalog = status?.ai.providers[provider];
            return <section className="panel form-grid" key={provider}>
              <h2>{name}</h2>
              <p className="muted small">
                Installation: <strong>{catalog?.available ? "Found on web server" : "Not detected / disabled"}</strong>.
                Authentication is checked only by running this test.
              </p>
              <label>{name} model
                <input aria-label={name + " model"} list={provider + "-models"} value={models[provider]}
                  maxLength={100} onChange={e => setModels(prev => ({ ...prev, [provider]: e.target.value }))} />
                <datalist id={provider + "-models"}>{(catalog?.models || []).map(m => <option key={m} value={m} />)}</datalist>
              </label>
              <button className="btn primary" disabled={!!running || !canRun || !catalog?.available || !models[provider]}
                onClick={() => void testCli(provider)}>
                {running === provider ? "Running…" : "Run " + name + " test"}
              </button>
              {testStatus(provider)}
            </section>;
          })}
        </div>
        <section className="panel form-grid">
          <h2>Azure Speech</h2>
          <p>Credentials: <strong>{status?.azure.configured ? "Configured" : "Not configured"}</strong>
            {status?.azure.region ? " · Region: " + status.azure.region : ""}.
            Voice catalog: <strong>{voices?.enabled ? "Loaded from Azure" : "Not available"}</strong>.
          </p>
          <p className="muted small">Audio and recognized text are not stored in the interview database. Azure processes speech during live tests. Allow microphone access in the browser (HTTPS or localhost).</p>
          <div className="device-row">
            <button className="btn secondary" disabled={!!running || !canRun || !status?.azure.configured}
              onClick={() => void run("azure_auth", async () => {
                await getCredential();
                return "Azure issued a short-lived browser Speech authorization token.";
              })}>Test Azure credentials</button>
            <button className="btn secondary" disabled={!!running || !canRun}
              onClick={() => void run("speaker", async () => { await checkSpeaker(); return "Local test tone played (confirm you heard it)."; })}>
              Test speaker</button>
            <button className="btn secondary" disabled={!!running || !canRun}
              onClick={() => void run("mic", async () => { await checkMicrophone(); return "Browser microphone permission granted."; })}>
              Test microphone</button>
          </div>
          {testStatus("azure_auth")}{testStatus("speaker")}{testStatus("mic")}
          <div className="cols">
            <label>Interviewer voice language
              <select aria-label="Test interviewer language" value={locale} onChange={e => {
                const next = e.target.value as Locale;
                setLocale(next); setVoice((voices?.enabled ? voices.voices[next]?.[0] : undefined) || voiceByLocale[next][0]);
              }}>
                {localeOptions.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
            <label>Azure voice
              <select aria-label="Test Azure voice" value={voice} onChange={e => setVoice(e.target.value)}>
                {voiceOptions.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>
          </div>
          <button className="btn primary" disabled={!!running || !canRun || !status?.azure.configured || !voiceOptions.includes(voice)}
            onClick={() => void testTts()}>Play real Azure TTS sample</button>
          {testStatus("azure_tts")}
          <label>Candidate STT recognition language
            <select aria-label="Test speech recognition language" value={sttLocale} onChange={e => setSttLocale(e.target.value as Locale)}>
              {localeOptions.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={!!running || !canRun || !status?.azure.configured}
            onClick={() => void run("azure_stt", async () => {
              setTranscript("");
              const recognized = await listen(sttLocale, await getCredential());
              setTranscript(recognized);
              return "Azure recognized spoken audio in " + sttLocale + ".";
            })}>{running === "azure_stt" ? "Listening…" : "Record once with Azure STT"}</button>
          {testStatus("azure_stt")}
          {transcript && <div className="soft-notice"><strong>Recognized text (not saved)</strong><p>{transcript}</p></div>}
        </section>
        <p className="muted small">Results are local to this page and disappear on refresh. CLI challenges are fixed and do not include any JD, CV or interview transcript. CLI status detection alone does not prove an authenticated session.</p>
      </main>
    </div>
  </div>;
}
