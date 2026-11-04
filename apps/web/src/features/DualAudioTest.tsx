"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadAzureSdk, type ContinuousListener, type SpeechCredential } from "./azure-client";

type Source = "candidate" | "interviewer";
type Locale = "en-US" | "en-GB" | "vi-VN";
type TranscriptLine = { id: number; text: string; time: string };
type ChannelState = { connected: boolean; listening: boolean; level: number; partial: string; lines: TranscriptLine[]; error: string };
type Capture = { stream: MediaStream; stopMeter: () => void };
type DiagnosticStatus = { enabled: boolean; azure: { configured: boolean; region: string | null } };

const options: { value: Locale; label: string }[] = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "vi-VN", label: "Tiếng Việt" },
];
const initialChannel = (): ChannelState => ({
  connected: false, listening: false, level: 0, partial: "", lines: [], error: "",
});
const now = () => new Date().toLocaleTimeString();

async function azureToken(): Promise<{ token: string; region: string; expiresIn: number }> {
  const response = await fetch("/api/me/provider-tests/azure/token", {
    method: "POST", credentials: "same-origin", cache: "no-store",
  });
  const payload = await response.json() as { token?: string; region?: string; expiresIn?: number; error?: string };
  if (!response.ok || !payload.token || !payload.region || !payload.expiresIn) {
    throw new Error(payload.error || "Could not get Azure Speech token");
  }
  return { token: payload.token, region: payload.region, expiresIn: payload.expiresIn };
}

/** Measures input signal without routing captured audio to an output device. */
function startMeter(stream: MediaStream, onLevel: (level: number) => void): () => void {
  const context = new AudioContext();
  const source = context.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);
  let frame = 0;
  let last = 0;
  let stopped = false;
  void context.resume().catch(() => {});
  const tick = (time: number) => {
    if (stopped) return;
    if (time - last >= 90) {
      last = time;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const offset = (sample - 128) / 128;
        sum += offset * offset;
      }
      const rms = Math.sqrt(sum / samples.length);
      onLevel(Math.min(100, Math.round(rms * 320)));
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    source.disconnect();
    void context.close().catch(() => {});
  };
}

export default function DualAudioTest({ email }: { email: string }) {
  const [channels, setChannels] = useState<Record<Source, ChannelState>>({
    candidate: initialChannel(), interviewer: initialChannel(),
  });
  const [locale, setLocale] = useState<Record<Source, Locale>>({ candidate: "en-US", interviewer: "en-US" });
  const [diagnostics, setDiagnostics] = useState<DiagnosticStatus | null>(null);
  const [globalError, setGlobalError] = useState("");
  const [busy, setBusy] = useState(false);
  const captures = useRef<Record<Source, Capture | null>>({ candidate: null, interviewer: null });
  const recognizers = useRef<Record<Source, ContinuousListener | null>>({ candidate: null, interviewer: null });
  const tokenCache = useRef<{ value: SpeechCredential; expiry: number } | null>(null);
  const runVersion = useRef(0);
  const lineId = useRef(0);
  const unmounted = useRef(false);

  function patch(source: Source, update: Partial<ChannelState>) {
    if (unmounted.current) return;
    setChannels(current => ({ ...current, [source]: { ...current[source], ...update } }));
  }

  useEffect(() => {
    unmounted.current = false;
    const runningVersion = runVersion;
    const recognitionRefs = recognizers;
    const captureRefs = captures;
    fetch("/api/me/provider-tests", { cache: "no-store", credentials: "same-origin" })
      .then(async response => {
        const result = await response.json() as DiagnosticStatus & { error?: string };
        if (!response.ok) throw new Error(result.error || "Cannot read diagnostic status");
        if (!unmounted.current) setDiagnostics(result);
      })
      .catch(error => { if (!unmounted.current) setGlobalError(String(error)); });
    return () => {
      unmounted.current = true;
      runningVersion.current++;
      for (const source of ["candidate", "interviewer"] as const) {
        const listener = recognitionRefs.current[source];
        recognitionRefs.current[source] = null;
        if (listener) void listener.stop().catch(() => {});
        const capture = captureRefs.current[source];
        captureRefs.current[source] = null;
        if (capture) {
          capture.stopMeter();
          capture.stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);

  async function stopAzure(source: Source) {
    const recognizer = recognizers.current[source];
    recognizers.current[source] = null;
    patch(source, { listening: false, partial: "" });
    if (recognizer) {
      try { await recognizer.stop(); }
      catch (error) { patch(source, { error: "Could not stop Azure: " + String(error) }); }
    }
  }

  async function disconnect(source: Source) {
    runVersion.current++;
    await stopAzure(source);
    const current = captures.current[source];
    captures.current[source] = null;
    if (current) {
      current.stopMeter();
      current.stream.getTracks().forEach(track => track.stop());
    }
    patch(source, { connected: false, listening: false, level: 0, partial: "" });
  }

  function registerCapture(source: Source, stream: MediaStream) {
    const audio = stream.getAudioTracks()[0];
    if (!audio) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("No audio track. Choose a Chrome Tab and enable Share tab audio.");
    }
    const stopMeter = startMeter(stream, level => patch(source, { level }));
    captures.current[source] = { stream, stopMeter };
    const ended = () => {
      if (captures.current[source]?.stream === stream) void disconnect(source);
    };
    audio.addEventListener("ended", ended, { once: true });
    if (source === "interviewer") {
      stream.getVideoTracks()[0]?.addEventListener("ended", ended, { once: true });
    }
    patch(source, { connected: true, error: "", level: 0, lines: [], partial: "" });
  }

  async function connectMicrophone() {
    setGlobalError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      patch("candidate", { error: "This browser does not support microphone capture over this connection." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (unmounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      registerCapture("candidate", stream);
    } catch (error) { patch("candidate", { error: String(error) }); }
  }

  async function connectMeetingTab() {
    setGlobalError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      patch("interviewer", { error: "This browser does not support tab capture. Use desktop Chrome." });
      return;
    }
    try {
      // Must be called directly from the click gesture. Browser always asks the user what to share.
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: { suppressLocalAudioPlayback: false },
        selfBrowserSurface: "exclude",
        systemAudio: "exclude",
      } as DisplayMediaStreamOptions);
      if (unmounted.current) { stream.getTracks().forEach(track => track.stop()); return; }
      const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      if (surface && surface !== "browser") {
        stream.getTracks().forEach(track => track.stop());
        throw new Error("Select Chrome Tab (not Entire Screen or Window).");
      }
      registerCapture("interviewer", stream);
    } catch (error) { patch("interviewer", { error: String(error) }); }
  }

  async function getCredential(): Promise<SpeechCredential> {
    if (tokenCache.current && tokenCache.current.expiry > Date.now() + 30_000) {
      return tokenCache.current.value;
    }
    const token = await azureToken();
    const value = { token: token.token, region: token.region };
    tokenCache.current = { value, expiry: Date.now() + token.expiresIn * 1000 };
    return value;
  }

  async function startAzure() {
    if (busy) return;
    const sources = (["candidate", "interviewer"] as const).filter(source => captures.current[source]);
    if (!sources.length) {
      setGlobalError("Connect at least one audio source first.");
      return;
    }
    setBusy(true);
    setGlobalError("");
    const version = ++runVersion.current;
    try {
      await loadAzureSdk();
      const credential = await getCredential();
      for (const source of sources) {
        const capture = captures.current[source];
        if (!capture || unmounted.current || version !== runVersion.current) break;
        if (recognizers.current[source]) continue;
        try {
          const listener = await startInputStreamRecognition(capture.stream, locale[source], credential, {
            partial: text => patch(source, { partial: text }),
            final: text => {
              if (unmounted.current) return;
              setChannels(current => ({
                ...current,
                [source]: {
                  ...current[source],
                  partial: "",
                  lines: [...current[source].lines, { id: ++lineId.current, text, time: now() }].slice(-30),
                },
              }));
            },
            error: message => patch(source, { error: message, listening: false }),
          });
          if (unmounted.current || version !== runVersion.current || captures.current[source] !== capture) {
            await listener.stop();
            continue;
          }
          recognizers.current[source] = listener;
          patch(source, { listening: true, error: "" });
        } catch (error) { patch(source, { listening: false, error: "Azure STT: " + String(error) }); }
      }
    } catch (error) {
      if (version === runVersion.current && !unmounted.current) setGlobalError(String(error));
    } finally {
      if (!unmounted.current) setBusy(false);
    }
  }

  async function stopAllAzure() {
    runVersion.current++;
    setBusy(true);
    await Promise.all((["candidate", "interviewer"] as const).map(source => stopAzure(source)));
    if (!unmounted.current) setBusy(false);
  }

  const renderChannel = (source: Source, title: string, description: string) => {
    const channel = channels[source];
    return <section className="panel form-grid" key={source}>
      <h2>{title}</h2>
      <p className="muted small">{description}</p>
      <p><strong>Capture:</strong> {channel.connected ? "Connected" : "Not connected"} ·
        <strong> Azure:</strong> {channel.listening ? " Listening" : " Stopped"}</p>
      <div className="device-row">
        {!channel.connected ?
          <button className="btn primary" disabled={busy} onClick={() => {
            if (source === "candidate") void connectMicrophone();
            else void connectMeetingTab();
          }}>{source === "candidate" ? "Connect microphone" : "Share meeting tab audio"}</button> :
          <button className="btn secondary" onClick={() => void disconnect(source)}>Disconnect</button>}
      </div>
      <label>Volume level ({channel.level}%)
        <progress aria-label={title + " input level"} max={100} value={channel.level} style={{ width: "100%", height: 16 }} />
      </label>
      <label>Recognition language
        <select aria-label={title + " recognition language"} value={locale[source]}
          disabled={channel.listening || busy}
          onChange={event => setLocale(current => ({ ...current, [source]: event.target.value as Locale }))}>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {channel.error && <p role="alert" className="alert error">{channel.error}</p>}
      <div className="soft-notice" style={{ minHeight: 170, maxHeight: 290, overflowY: "auto" }}>
        <strong>Azure transcript · {title}</strong>
        {channel.lines.length === 0 && !channel.partial && <p className="muted small">No speech recognized yet.</p>}
        {channel.lines.map(line => <p key={line.id} style={{ overflowWrap: "anywhere" }}>
          <small className="muted">{line.time} · </small>{line.text}
        </p>)}
        {channel.partial && <p aria-live="polite" className="muted" style={{ overflowWrap: "anywhere" }}>
          {channel.partial} …
        </p>}
      </div>
    </section>;
  };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand">◉ <strong>Interview Simulation</strong></div>
      <div className="side-caption">DUAL AUDIO DIAGNOSTICS</div>
      <nav aria-label="Workspace navigation">
        <Link className="live-entry" href="/settings/test">← Provider tests</Link>
        <Link className="live-entry" href="/settings">AI settings</Link>
        <Link className="live-entry" href="/live">AI interview</Link>
      </nav>
      <div className="sidebar-bottom">Capture happens only after permission. Audio is sent to Azure only when STT is started. No transcript is saved.</div>
    </aside>
    <div className="main-area">
      <header className="topbar"><span className="eyebrow">CHROME AUDIO INPUT TEST</span><small>{email}</small></header>
      <main className="page">
        <h1>Microphone + meeting tab audio</h1>
        <p className="lead">Test two separate audio sources and two Azure Speech recognizers before building realtime interview hints.</p>
        <section className="panel">
          <h2>How to test</h2>
          <p>1. Open Meet / Zoom Web / Teams Web in another Chrome tab and use headphones.</p>
          <p>2. Connect your microphone, then share the actual meeting <strong>Chrome Tab</strong> with <strong>Share tab audio</strong> enabled.</p>
          <p>3. Confirm both volume meters move independently. Start Azure STT to see live transcripts.</p>
          <p className="muted small">Chrome requires video permission for tab capture, but this page ignores the video track. Only tab audio is used. Remote tab audio does not identify individual reviewers.</p>
          <p className="muted small">Provider tests: <strong>{diagnostics ? (diagnostics.enabled ? "Enabled" : "Disabled") : "Checking…"}</strong> ·
            Azure: <strong>{diagnostics?.azure.configured ? "Configured" : "Not configured"}</strong>
            {diagnostics?.azure.region ? " · " + diagnostics.azure.region : ""}</p>
          {diagnostics && (!diagnostics.enabled || !diagnostics.azure.configured) && <p className="alert info">
            To test STT, configure Azure Speech credentials and ENABLE_PROVIDER_TESTS=true on the trusted local server, then restart. Capture/meter tests work without Azure.
          </p>}
          {globalError && <p role="alert" className="alert error">{globalError}</p>}
        </section>
        <div className="cols">
          {renderChannel("candidate", "Candidate · Microphone", "Your voice from the selected microphone device.")}
          {renderChannel("interviewer", "Interviewer · Chrome Tab", "Audio output from the selected Meet / Zoom / Teams browser tab.")}
        </div>
        <section className="panel">
          <h2>Azure Speech-to-Text</h2>
          <p className="muted small">Run recognizers for any connected sources. Final transcripts are kept only in page memory. Azure charges can apply.</p>
          <div className="device-row">
            <button className="btn primary" disabled={busy || !diagnostics?.enabled || !diagnostics.azure.configured ||
              (!channels.candidate.connected && !channels.interviewer.connected) ||
              (channels.candidate.listening && channels.interviewer.listening)}
              onClick={() => void startAzure()}>{busy ? "Working…" : "Start Azure STT"}</button>
            <button className="btn secondary" disabled={busy || (!channels.candidate.listening && !channels.interviewer.listening)}
              onClick={() => void stopAllAzure()}>Stop Azure STT</button>
            <button className="btn secondary" onClick={() => setChannels(current => ({
              candidate: { ...current.candidate, lines: [], partial: "" },
              interviewer: { ...current.interviewer, lines: [], partial: "" },
            }))}>Clear transcripts</button>
          </div>
          <p className="muted small">After the test, disconnect both audio sources or stop sharing using Chrome&apos;s sharing indicator. No audio recording or AI hints are created.</p>
          <p className="muted small">Speaker identity is inferred by audio source, not voice biometrics. Use with participant consent and follow interview policies.</p>
        </section>
      </main>
    </div>
  </div>;
}

/** A separate Azure recognizer per stream: never mix candidate and remote tab audio. */
async function startInputStreamRecognition(stream: MediaStream, locale: Locale, credential: SpeechCredential,
  callbacks: { partial: (text: string) => void; final: (text: string) => void; error: (message: string) => void }
): Promise<ContinuousListener> {
  const sdk = await loadAzureSdk();
  const originalTrack = stream.getAudioTracks()[0];
  if (!originalTrack || originalTrack.readyState !== "live") throw new Error("Audio source is no longer active");
  const audioTrack = originalTrack.clone();
  const input = sdk.AudioConfig.fromStreamInput(new MediaStream([audioTrack]));
  const config = sdk.SpeechConfig.fromAuthorizationToken(credential.token, credential.region);
  config.speechRecognitionLanguage = locale;
  const recognizer = new sdk.SpeechRecognizer(config, input);
  let stopped = false;
  let accumulated = "";
  recognizer.recognizing = (_: unknown, event: { result?: { text?: string } }) =>
    callbacks.partial(event.result?.text || "");
  recognizer.recognized = (_: unknown, event: { result?: { reason: number; text?: string } }) => {
    const result = event.result;
    if (result?.reason === sdk.ResultReason.RecognizedSpeech && result.text?.trim()) {
      const text = result.text.trim();
      accumulated += (accumulated ? " " : "") + text;
      callbacks.final(text);
    }
  };
  recognizer.canceled = (_: unknown, event: { reason: number; errorDetails?: string }) => {
    if (!stopped && event.reason === sdk.CancellationReason.Error) {
      callbacks.error(event.errorDetails || "Azure recognition canceled");
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(resolve,
        (error: string) => reject(new Error(String(error))));
    });
  } catch (error) {
    recognizer.close();
    input.close();
    audioTrack.stop();
    throw error;
  }
  return {
    stop: async () => {
      if (stopped) return accumulated;
      stopped = true;
      try {
        await new Promise<void>((resolve, reject) =>
          recognizer.stopContinuousRecognitionAsync(resolve,
            (error: string) => reject(new Error(String(error)))));
      } finally {
        recognizer.close();
        input.close();
        audioTrack.stop();
      }
      return accumulated;
    },
  };
}
