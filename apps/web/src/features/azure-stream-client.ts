"use client";

import { loadAzureSdk, type SpeechCredential } from "./azure-client";

type Locale = "en-US" | "en-GB" | "vi-VN";
export type StreamRecognitionCallbacks = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (message: string) => void;
  onAudioFrames: (frames: number) => void;
  onError: (message: string) => void;
};
export type StreamRecognition = { stop: () => Promise<void> };

/**
 * Capture MediaStream audio into a 16-kHz / mono / 16-bit PCM push stream.
 * This bypasses Speech SDK's opaque browser MediaStream recorder so that
 * we can verify that real PCM frames reach Azure from BOTH audio sources.
 * ScriptProcessorNode is deprecated but supported in Chrome; keep it
 * isolated here until AudioWorklet is introduced for production use.
 */
export async function startStreamRecognition(
  originalStream: MediaStream, locale: Locale, credential: SpeechCredential,
  callbacks: StreamRecognitionCallbacks,
): Promise<StreamRecognition> {
  const sdk = await loadAzureSdk();
  const originalTrack = originalStream.getAudioTracks()[0];
  if (!originalTrack || originalTrack.readyState !== "live") {
    throw new Error("The captured audio track is not active.");
  }

  const clonedTrack = originalTrack.clone();
  const context = new AudioContext({ sampleRate: 16000 });
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNode | null = null;
  let recognizer: { close: () => void; startContinuousRecognitionAsync: (ok: () => void, fail: (error: string) => void) => void;
    stopContinuousRecognitionAsync: (ok: () => void, fail: (error: string) => void) => void } | null = null;
  let audioConfig: { close: () => void } | null = null;
  let push: { write: (buffer: ArrayBuffer) => void; close: () => void } | null = null;
  let stopped = false;
  let frames = 0;
  let lastFrameReport = 0;

  const cleanup = async () => {
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
    }
    source?.disconnect();
    clonedTrack.stop();
    push?.close();
    audioConfig?.close();
    recognizer?.close();
    if (context.state !== "closed") await context.close();
  };

  try {
    if (context.sampleRate !== 16000) {
      throw new Error("AudioContext did not select 16-kHz PCM.");
    }
    const format = sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1);
    push = sdk.AudioInputStream.createPushStream(format);
    audioConfig = sdk.AudioConfig.fromStreamInput(push);
    const config = sdk.SpeechConfig.fromAuthorizationToken(credential.token, credential.region);
    config.speechRecognitionLanguage = locale;

    const speech = new sdk.SpeechRecognizer(config, audioConfig);
    recognizer = speech;

    speech.sessionStarted = () => callbacks.onStatus("Azure session connected");
    speech.speechStartDetected = () => callbacks.onStatus("Speech detected by Azure");
    speech.recognizing = (_: unknown, event: { result?: { text?: string } }) => {
      if (event.result?.text) callbacks.onPartial(event.result.text);
    };
    speech.recognized = (_: unknown, event: { result?: { text?: string; reason?: number } }) => {
      const result = event.result;
      if (result && result.reason === sdk.ResultReason.RecognizedSpeech && typeof result.text === "string" && result.text.trim()) {
        callbacks.onFinal(result.text.trim());
      } else if (result?.reason === sdk.ResultReason.NoMatch) {
        callbacks.onStatus("Azure received audio but could not recognize words (NoMatch)");
      }
    };
    speech.canceled = (_: unknown, event: { reason?: number; errorDetails?: string }) => {
      if (!stopped) callbacks.onError("Azure canceled: " + (event.errorDetails || String(event.reason ?? "unknown")));
    };
    speech.sessionStopped = () => {
      if (!stopped) callbacks.onStatus("Azure session stopped");
    };

    source = context.createMediaStreamSource(new MediaStream([clonedTrack]));
    // Connect to a silent output so Chrome processes the node without replaying audio.
    processor = context.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = event => {
      if (stopped || clonedTrack.readyState !== "live" || !push) return;
      const input = event.inputBuffer.getChannelData(0);
      const bytes = new ArrayBuffer(input.length * 2);
      const view = new DataView(bytes);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      push.write(bytes);
      frames++;
      const time = performance.now();
      if (time - lastFrameReport >= 450) {
        callbacks.onAudioFrames(frames);
        lastFrameReport = time;
      }
    };
    source.connect(processor);
    processor.connect(context.destination); // WebAudio produces silence here.
    await context.resume();
    if (context.state !== "running") throw new Error("Audio processing is suspended. Click Start Azure STT again.");

    callbacks.onStatus("Streaming PCM to Azure (16 kHz / mono)");
    await new Promise<void>((resolve, reject) =>
      speech.startContinuousRecognitionAsync(resolve, (error: string) => reject(new Error(String(error)))));
    if (stopped) {
      await cleanup();
      throw new Error("The audio source stopped before recognition started.");
    }

    return {
      stop: async () => {
        if (stopped) return;
        stopped = true;
        if (processor) processor.onaudioprocess = null;
        try {
          await new Promise<void>((resolve, reject) =>
            speech.stopContinuousRecognitionAsync(resolve, (error: string) => reject(new Error(String(error)))));
        } finally { await cleanup(); }
      },
    };
  } catch (error) {
    stopped = true;
    await cleanup();
    throw error;
  }
}
