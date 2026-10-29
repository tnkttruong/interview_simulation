"use client";
// Version pinned (1.52.0) and self-hosted under public/vendor/azure-speech (see README there). Never load subscription key in browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SDK=any;
const url="/vendor/azure-speech/microsoft.cognitiveservices.speech.sdk.bundle-min.js";
let loading:Promise<SDK>|undefined;
export function loadAzureSdk():Promise<SDK>{
 if(typeof window==="undefined")return Promise.reject(new Error("Browser required"));
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const win=window as any;
 if(win.SpeechSDK)return Promise.resolve(win.SpeechSDK);
 if(loading)return loading;
 loading=new Promise((resolve,reject)=>{
  const script=document.createElement("script");
  script.src=url;script.async=true;
  script.onload=()=>win.SpeechSDK?resolve(win.SpeechSDK):reject(new Error("Azure SDK missing"));
  script.onerror=()=>reject(new Error("Azure Speech SDK failed to load"));
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
export interface ContinuousListener{
 stop:()=>Promise<string>;
}
export async function startContinuousListening(
 locale:string,
 credential:SpeechCredential,
 callbacks:{
  onRecognizing?:(interim:string)=>void;
  onRecognized?:(accumulated:string)=>void;
  onError?:(err:Error)=>void;
 }
):Promise<ContinuousListener>{
 const sdk=await loadAzureSdk();
 const cfg=sdk.SpeechConfig.fromAuthorizationToken(credential.token,credential.region);
 cfg.speechRecognitionLanguage=locale;
 const mic=sdk.AudioConfig.fromDefaultMicrophoneInput();
 const recog=new sdk.SpeechRecognizer(cfg,mic);
 let accumulated="";
 let stopped=false;
 recog.recognizing=(_s:SDK,e:{result?:{text?:string}})=>{
  if(e.result?.text)callbacks.onRecognizing?.(e.result.text);
 };
 recog.recognized=(_s:SDK,e:{result?:{reason:number,text?:string}})=>{
  const res=e.result;
  if(res&&res.reason===sdk.ResultReason.RecognizedSpeech&&res.text?.trim()){
   const sentence=res.text.trim();
   accumulated=accumulated?`${accumulated} ${sentence}`:sentence;
   callbacks.onRecognized?.(accumulated);
  }
 };
 recog.canceled=(_s:SDK,e:{reason:number,errorDetails?:string})=>{
  if(e.reason===sdk.CancellationReason?.Error){
   callbacks.onError?.(new Error(e.errorDetails||"Speech recognition canceled"));
  }
 };
 await new Promise<void>((resolve,reject)=>{
  recog.startContinuousRecognitionAsync(
   ()=>resolve(),
   (err:string)=>reject(new Error(String(err)))
  );
 });
 return {
  stop:async()=>{
   if(stopped)return accumulated;
   stopped=true;
   try{
    await new Promise<void>((resolve)=>{
     recog.stopContinuousRecognitionAsync(
      ()=>resolve(),
      ()=>resolve()
     );
    });
   }finally{
    recog.close();
   }
   return accumulated;
  }
 };
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
