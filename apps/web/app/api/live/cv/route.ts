import {NextResponse} from "next/server";
import {extractDocx} from "@/server/cv";
import {currentUser,safeError,tracedApi,unauthorized} from "@/server/request";
import {DomainError} from "@interview/core";
export const runtime="nodejs";
export async function POST(req:Request){
 return tracedApi(req,"cv.extract",async()=>{
  const user=await currentUser(req);if(!user)return unauthorized();
  try{
   // Reject oversized bodies before buffering them (multipart overhead allowance).
   if(Number(req.headers.get("content-length")||0)>5*1024*1024)throw new DomainError("limit","CV must be 1 byte to 4 MB");
   const data=await req.formData();
   const file=data.get("file");
   if(!(file instanceof File))throw new DomainError("invalid","Upload CV file");
   if(file.size>4*1024*1024||file.size<1)throw new DomainError("limit","CV must be 1 byte to 4 MB");
   const lower=file.name.toLowerCase();
   const buf=Buffer.from(await file.arrayBuffer());
   let content:string;
   if(/\.(txt|md)$/.test(lower))content=new TextDecoder("utf-8",{fatal:true}).decode(buf);
   else if(lower.endsWith(".docx"))content=extractDocx(buf);
   else throw new DomainError("invalid","Supported server uploads: DOCX, TXT, MD; PDF uses browser PDF.js");
   content=content.replace(/\u0000/g,"").trim().slice(0,30000);
   if(content.length<15)throw new DomainError("invalid","No readable CV content found");
   return NextResponse.json({cvText:content,cvFilename:file.name},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return safeError(error);}
 });
}
