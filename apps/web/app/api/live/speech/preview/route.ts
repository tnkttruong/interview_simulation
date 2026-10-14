import {NextResponse} from "next/server";
import {z} from "zod";
import {voiceByLocale} from "@interview/core";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
import {DomainError} from "@interview/core";
import {createThrottle} from "@/server/guards";
export const runtime="nodejs";
const input=z.object({interviewerLocale:z.enum(["en-US","en-GB","vi-VN"]),voiceId:z.string().max(80)});
const throttle=createThrottle(10000);
export async function POST(req:Request){
 return tracedApi(req,"speech.preview",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{
   const parsed=input.parse(await req.json());
   if(!(voiceByLocale[parsed.interviewerLocale] as readonly string[]).includes(parsed.voiceId))
    throw new DomainError("invalid","Unsupported voice");
   const region=process.env.AZURE_SPEECH_REGION,key=process.env.AZURE_SPEECH_KEY;
   if(!region||!key||!/^[a-z0-9-]{2,35}$/.test(region))
    throw new DomainError("invalid","Azure Speech unavailable");
   if(!throttle.tryAcquire(user.id))return NextResponse.json({error:"Please retry the preview later"},{status:429});
   const phrase=parsed.interviewerLocale==="vi-VN"?"Xin chào, chào mừng bạn đến buổi phỏng vấn."
     :"Hello, welcome to your interview practice.";
   const ssml='<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="'+parsed.interviewerLocale+'"><voice name="'+parsed.voiceId+'">'+phrase+'</voice></speak>';
   const response=await fetch("https://"+region+".tts.speech.microsoft.com/cognitiveservices/v1",{
    method:"POST",headers:{"Ocp-Apim-Subscription-Key":key,"Content-Type":"application/ssml+xml",
     "X-Microsoft-OutputFormat":"audio-16khz-32kbitrate-mono-mp3"},
    body:ssml,signal:AbortSignal.timeout(10000),cache:"no-store"
   });
   if(!response.ok)throw new DomainError("invalid","Voice preview failed");
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength>512000)throw new DomainError("limit","Voice preview unexpectedly large");
   return new NextResponse(bytes,{headers:{"Content-Type":"audio/mpeg","Cache-Control":"no-store"}});
  }catch(error){return safeError(error);}
 });
}
