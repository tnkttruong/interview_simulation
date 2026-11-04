# Chrome dual-audio capture test

Open **/settings/audio-test** after signing in. This is an isolated diagnostic page; it does not create an interview, save transcripts, or invoke any LLM.

## Setup

Run on https:// or localhost, with **Google Chrome desktop**. Configure the existing Azure Speech environment and enable the existing opt-in diagnostic flag:

```dotenv
AZURE_SPEECH_REGION=your-region
AZURE_SPEECH_KEY=your-key
ENABLE_PROVIDER_TESTS=true
```

Restart the Next.js server after changing environment values. The diagnostic token API is authenticated, throttled, and disabled by default. **Turn ENABLE_PROVIDER_TESTS off after testing** on any shared/public installation.

## Test procedure

For a repeatable recording, open **/settings/audio-samples** in a second Chrome tab (authenticated). It offers fixed questions synthesized by Azure TTS and played through a normal HTML audio element. Capture the **Sample audio player** tab from the audio-test page, start Azure STT, and then press Play in the sample tab. The player and STT need `ENABLE_PROVIDER_TESTS=true` and Azure credentials; Azure may bill for each new synthesis. Replaying an already loaded sample does not invoke TTS again.

The test page now sends explicit PCM through an Azure push stream, and displays **PCM frames sent** plus **Azure status** for each channel. Connection alone does not begin transcription: press **Start Azure STT**.



1. Open Google Meet, Zoom Web, or Teams Web **in a separate Chrome tab**. Use headphones to prevent remote speech leaking into the microphone.
2. Click **Connect microphone**, grant permission, and speak. Observe the candidate input meter.
3. Click **Share meeting tab audio**. In Chrome's picker choose **Chrome Tab**, select the actual meeting tab, enable **Share tab audio**, and click Share. The page rejects non-tab captures and captures without an audio track. You can stop the sharing at any moment in Chrome.
4. Check the interviewer audio meter while someone on the remote call talks.
5. Click **Start Azure STT**. Both channels use their own Azure recognizer and independently chosen locales. Observe partial and finalized transcript in the respective source columns. Stop STT and capture separately when finished.

Captured tab video is required by getDisplayMedia, but this page does not display, transmit, or record the video. Audio is sent to the configured Azure Speech resource *only* while STT is running. Tokens and transcripts remain in memory; closing/reloading the tab clears them. Do not capture other speakers without appropriate consent.

## Limitations

- Browser tab capture is not arbitrary speaker/output-device capture. A tab's audio track may not be available even if requested; this is browser/OS dependent.
- The **interviewer** label means remote/tab audio. If several remote participants speak, this does *not* identify individual reviewers. Microphone spill/echo may appear in both channels.
- Azure Speech SDK uses independent SpeechRecognizers fed by WebAudio -> 16 kHz mono 16-bit PCM push streams. It is an STT/source-isolation smoke test, not a translation or diarization implementation. The WebAudio ScriptProcessor is diagnostic-only and should be replaced by AudioWorklet for production.
- Azure STT and TTS calls have real usage/cost. These pages deliberately do not connect to Ollama or persist any Q&A.
- Some Chrome capture configurations can affect local tab audio playback. Verify that you can still hear your meeting; if not, stop sharing and reconfigure.

## Automated validation

Typecheck, lint, and tests run in CI. **Real browser permissions and Azure credentials require a manual smoke test on the target Mac/Chrome.**
