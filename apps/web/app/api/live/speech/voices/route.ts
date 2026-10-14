import {NextResponse} from "next/server";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
import {voiceByLocale} from "@interview/core";
import {DomainError} from "@interview/core";
import {createThrottle} from "@/server/guards";
export const runtime="nodejs";
const throttle=createThrottle(10000);
export async function GET(req:Request){
 return tracedApi(req,"speech.voices",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{
   const key=process.env.AZURE_SPEECH_KEY,region=process.env.AZURE_SPEECH_REGION;
   if(!key||!region||!/^[a-z0-9-]{2,35}$/.test(region))return NextResponse.json({enabled:false,voices:voiceByLocale});
   if(!throttle.tryAcquire(user.id))return NextResponse.json({error:"Retry voice catalog in a moment"},{status:429});
   const response=await fetch("https://"+region+".tts.speech.microsoft.com/cognitiveservices/voices/list",{
     headers:{"Ocp-Apim-Subscription-Key":key},signal:AbortSignal.timeout(9000),cache:"no-store"
   });
   if(!response.ok)throw new DomainError("invalid","Azure voice catalog failed");
   const list=await response.json() as {ShortName:string,Locale:string}[];
   const known=new Set(list.map(x=>x.ShortName));
   const result:Record<string,string[]>={};
   for(const [locale,voices] of Object.entries(voiceByLocale))result[locale]=voices.filter(v=>known.has(v));
   return NextResponse.json({enabled:true,voices:result},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return safeError(error);}
 });
}
