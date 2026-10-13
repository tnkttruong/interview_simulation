"use client";
// Version pinned: official Azure browser SDK CDN distribution. Never load subscription key in browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SDK=any;
const url="https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.52.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle-min.js";
let loading:Promise<SDK>|undefined;
export function loadAzureSdk():Promise<SDK>{
 if(typeof window==="undefined")return Promise.reject(new Error("Browser required"));
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const win=window as any;
 if(win.SpeechSDK)return Promise.resolve(win.SpeechSDK);
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src=url;script.async=true;script.crossOrigin="anonymous";
  script.onload=()=>win.SpeechSDK?resolve(win.SpeechSDK):reject(new Error("Azure SDK missing"));
  script.onerror=()=>reject(new Error("Azure Speech CDN unavailable"));
  document.head.append(script);
 }).catch(e=>{loading=undefined;throw e;});
 return loading;
}
export interface SpeechCredential{token:string;region:string;}
export async function say(text:string,voiceId:string,credential:SpeechCredential){
 const sdk=await loadAzureSdk();
 const cfg=sdk.SpeechConfig.fromAuthorizationToken(credential.token,credential.region);
 cfg.speechSynthesisVoiceName=voiceId;
 const speaker=sdk.AudioConfig.fromDefaultSpeakerOutput();
 const synth=new sdk.SpeechSynthesizer(cfg,speaker);
 try{
  await new Promise<void>((resolve,reject)=>synth.speakTextAsync(text,(result:{reason:number})=>{
   if(result.reason===sdk.ResultReason.SynthesizingAudioCompleted)resolve();
   else reject(new Error("TTS synthesis failed"));
  },(error:string)=>reject(new Error(String(error)))));
 }finally{synth.close();}
}
export async function listen(locale:string,credential:SpeechCredential){
 const sdk=await loadAzureSdk();
 const cfg=sdk.SpeechConfig.fromAuthorizationToken(credential.token,credential.region);
 cfg.speechRecognitionLanguage=locale;
 const mic=sdk.AudioConfig.fromDefaultMicrophoneInput();
 const recog=new sdk.SpeechRecognizer(cfg,mic);
 try{
  return await new Promise<string>((resolve,reject)=>recog.recognizeOnceAsync(
   (result:{reason:number,text:string})=>{
    if(result.reason===sdk.ResultReason.RecognizedSpeech&&result.text.trim())resolve(result.text.trim());
    else reject(new Error("No recognized speech; type the answer instead"));
   },(error:string)=>reject(new Error(String(error)))));
 }finally{recog.close();}
}
export async function checkMicrophone(){
 if(!navigator.mediaDevices?.getUserMedia)throw new Error("Microphone unavailable; use HTTPS and a supported browser");
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 stream.getTracks().forEach(track=>track.stop());
}
export async function checkSpeaker(){
 // Audible local hardware check; not a forged Azure voice-preview claim.
 const context=new AudioContext();
 try{
  const oscillator=context.createOscillator(),gain=context.createGain();
  gain.gain.value=.06;oscillator.frequency.value=440;
  oscillator.connect(gain);gain.connect(context.destination);
  oscillator.start();oscillator.stop(context.currentTime+.18);
  await new Promise(r=>setTimeout(r,260));
 }finally{await context.close();}
}
