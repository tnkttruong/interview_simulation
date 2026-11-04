"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AUDIO_SAMPLES, type AudioSampleId } from "@/shared/audio-samples";

type DiagnosticStatus = { enabled: boolean; azure: { configured: boolean } };
export default function SampleAudioPlayer({ email }: { email: string }) {
  const [status, setStatus] = useState<DiagnosticStatus | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<AudioSampleId | null>(null);
  const [selected, setSelected] = useState<AudioSampleId | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const playback = audioRef.current;
    fetch("/api/me/provider-tests", { credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        const data = await response.json() as DiagnosticStatus & { error?: string };
        if (!response.ok) throw new Error(data.error || "Cannot check Azure diagnostics");
        if (mounted.current) setStatus(data);
      }).catch(err => { if (mounted.current) setError(String(err)); });
    return () => {
      mounted.current = false;
      playback?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    };
  }, []);

  async function playSample(id: AudioSampleId) {
    if (pending) return;
    setError("");
    const player = audioRef.current;
    player?.pause();
    if (selected === id && audioUrl) {
      if (player) {
        player.currentTime = 0;
        await player.play().catch(() => setError("Chrome blocked auto-play; click Play in the audio player below."));
      }
      return;
    }
    setPending(id);
    setPlaying(false);
    try {
      const response = await fetch("/api/me/provider-tests/audio-samples", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store", body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Azure TTS failed (HTTP " + response.status + ")");
      }
      const blob = await response.blob();
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setAudioUrl(url);
      setSelected(id);
      requestAnimationFrame(() => {
        if (!mounted.current) return;
        void audioRef.current?.play().catch(() =>
          setError("Click Play in the audio controls to start sample playback."));
      });
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setPending(null);
    }
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">◉ <strong>Interview Simulation</strong></div>
      <div className="side-caption">AUDIO SOURCE TEST</div>
      <nav aria-label="Workspace navigation">
        <Link className="live-entry" href="/settings/audio-test">← Dual audio capture test</Link>
        <Link className="live-entry" href="/settings/test">Provider tests</Link>
        <Link className="live-entry" href="/live">AI Interview</Link>
      </nav>
      <div className="sidebar-bottom">These are fixed spoken interview questions synthesized by your Azure Speech resource. No transcripts are stored here.</div>
    </aside>
    <div className="main-area">
      <header className="topbar"><span className="eyebrow">CHROME TAB AUDIO SAMPLES</span><small>{email}</small></header>
      <main className="page">
        <h1>Sample audio player</h1>
        <p className="lead">Keep this page open in a separate Chrome tab. Share this tab from /settings/audio-test, then play a question to verify that Azure STT can hear tab audio.</p>
        <section className="panel">
          <h2>How to run the two-tab test</h2>
          <p>1. Open <Link href="/settings/audio-test" target="_blank" rel="noopener noreferrer">Dual audio capture test in another tab</Link>.</p>
          <p>2. On that page, click <strong>Share meeting tab audio</strong>, choose <strong>this Sample audio player tab</strong> in Chrome Tab, and enable <strong>Share tab audio</strong>.</p>
          <p>3. On the capture page click <strong>Start Azure STT</strong>, and set interviewer recognition language to match the sample.</p>
          <p>4. Return here and press Play below. Verify the <strong>Interviewer · Chrome Tab</strong> meter and its live transcript change in the capture page.</p>
          <p className="muted small">Azure TTS sample output is played by an HTML audio element in this tab, not by the operating system&apos;s speechSynthesis. This makes it appropriate for Chrome tab audio capture.</p>
          {status && (!status.enabled || !status.azure.configured) && <p className="alert info">
            Configure AZURE_SPEECH_KEY, AZURE_SPEECH_REGION and ENABLE_PROVIDER_TESTS=true on the local web server, then restart it to enable playback.
          </p>}
          {error && <p role="alert" className="alert error">{error}</p>}
        </section>
        <section className="panel">
          <h2>Questions to play</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {AUDIO_SAMPLES.map(sample => <div key={sample.id}
              style={{ border: "1px solid #e1e7f1", borderRadius: 10, padding: 14 }}>
              <div className="device-row">
                <div style={{ flex: 1 }}>
                  <strong>{sample.title}</strong>
                  <p className="muted small" style={{ marginTop: 8 }}>{sample.text}</p>
                </div>
                <button className="btn primary" disabled={!!pending || !status?.enabled || !status.azure.configured}
                  onClick={() => void playSample(sample.id)}>
                  {pending === sample.id ? "Generating…" : selected === sample.id ? "Replay" : "▶ Play"}
                </button>
              </div>
            </div>)}
          </div>
          <p className="muted small">Each new sample is synthesized using Azure TTS and may incur a small charge. Replaying the loaded sample does not call Azure again.</p>
        </section>
        <section className="panel">
          <h2>Audio playback</h2>
          <p>{selected ? AUDIO_SAMPLES.find(sample => sample.id === selected)?.title : "Choose a sample above."}
            {playing ? " · Playing" : ""}</p>
          <audio ref={audioRef} src={audioUrl || undefined} controls
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            style={{ width: "100%" }} aria-label="Audio sample playback" />
        </section>
      </main>
    </div>
  </div>;
}
