import { NextResponse } from "next/server";
import { currentUser, safeError, tracedApi, unauthorized } from "@/server/request";
import { getSession } from "@/server/demo";
import { z } from "zod";
import { DomainError } from "@interview/core";
export const runtime="nodejs";
const requestSchema=z.object({sessionId:z.string().uuid()});
const issued=new Map<string,number>();
export async function POST(req:Request){
 return tracedApi(req,"speech.token",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{
   const {sessionId}=requestSchema.parse(await req.json());
   const session=getSession(user.id,sessionId);
   if(session.mode!=="live" || session.state!=="IN_PROGRESS")throw new DomainError("invalid","Live session required");
   const key=process.env.AZURE_SPEECH_KEY;
   const region=process.env.AZURE_SPEECH_REGION;
   if(!key||!region||!/^[a-z0-9-]{2,35}$/.test(region))throw new DomainError("invalid","Azure Speech is not configured");
   const cacheKey=user.id+":"+sessionId;
   const last=issued.get(cacheKey)??0;
   if(Date.now()-last<30000)return NextResponse.json({error:"Speech token throttle; retry later"},{status:429});
   issued.set(cacheKey,Date.now());
   const response=await fetch("https://"+region+".api.cognitive.microsoft.com/sts/v1.0/issueToken",{
    method:"POST",headers:{"Ocp-Apim-Subscription-Key":key,"Content-Type":"application/x-www-form-urlencoded"},
    signal:AbortSignal.timeout(9000),cache:"no-store"
   });
   if(!response.ok)throw new DomainError("invalid","Azure Speech token request failed");
   const token=await response.text();
   if(!token||token.length>4096)throw new DomainError("invalid","Azure Speech token invalid");
   return NextResponse.json({token,region,expiresIn:540},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return safeError(error);}
 });
}
