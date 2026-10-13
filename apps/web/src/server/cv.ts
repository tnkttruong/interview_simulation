import "server-only";
import {inflateRawSync} from "node:zlib";
import {DomainError} from "@interview/core";
function textFromXml(xml:string){
 return xml.replace(/<\/w:p>/g,"\n").replace(/<w:tab[^>]*\/>/g,"\t")
 .replace(/<[^>]+>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">")
 .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&apos;/g,"'")
 .replace(/\n{3,}/g,"\n\n").trim();
}
/** ZIP central directory parsing avoids trusting local-header compressed lengths. */
export function extractDocx(data:Buffer){
 if(data.length>4*1024*1024)throw new DomainError("limit","CV exceeds 4 MB");
 const eocd=data.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 if(eocd<0||eocd+22>data.length)throw new DomainError("invalid","Invalid DOCX archive");
 const entries=data.readUInt16LE(eocd+10);
 const offset=data.readUInt32LE(eocd+16);
 if(entries>1000||offset>=data.length)throw new DomainError("invalid","Invalid DOCX directory");
 let ptr=offset;
 for(let i=0;i<entries;i++){
  if(ptr+46>data.length||data.readUInt32LE(ptr)!==0x02014b50)throw new DomainError("invalid","Invalid ZIP entry");
  const method=data.readUInt16LE(ptr+10);
  const compressed=data.readUInt32LE(ptr+20);
  const size=data.readUInt32LE(ptr+24);
  const nameLen=data.readUInt16LE(ptr+28);
  const extra=data.readUInt16LE(ptr+30);
  const comment=data.readUInt16LE(ptr+32);
  const local=data.readUInt32LE(ptr+42);
  const name=data.toString("utf8",ptr+46,ptr+46+nameLen);
  ptr+=46+nameLen+extra+comment;
  if(name!=="word/document.xml")continue;
  if(size>2*1024*1024||compressed>2*1024*1024)throw new DomainError("limit","DOCX content is too large");
  if(local+30>data.length||data.readUInt32LE(local)!==0x04034b50)throw new DomainError("invalid","Invalid ZIP local entry");
  const start=local+30+data.readUInt16LE(local+26)+data.readUInt16LE(local+28);
  if(start+compressed>data.length)throw new DomainError("invalid","Truncated DOCX");
  const bytes=data.subarray(start,start+compressed);
  const xml=method===8?inflateRawSync(bytes,{maxOutputLength:2*1024*1024}):method===0?bytes:null;
  if(!xml||xml.length!==size)throw new DomainError("invalid","Unsupported DOCX compression");
  return textFromXml(xml.toString("utf8")).slice(0,30000);
 }
 throw new DomainError("invalid","DOCX document.xml not found");
}
