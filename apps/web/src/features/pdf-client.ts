"use client";
// Client-only PDF text extraction; no raw PDF leaves the browser.
// PDF.js v3 classic distribution exposes pdfjsLib as window global.
const version="3.11.174";
const pdfScriptIntegrity="sha256-W1eZ5vjGgGYyB6xbQu4U7tKkBvp69I9QwVTwwLFWaUY=";
const workerSha256="/qvfMJdw7SS7oxpUZ4Ns3Iz2OccFryfVK1hbBBu4Uns=";
let trustedWorker:Promise<string>|undefined;
/** A worker has no HTML SRI attribute, so validate the exact bytes before creating its blob URL. */
export async function verifyPdfWorkerBytes(bytes:ArrayBuffer):Promise<void>{
 const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",bytes));
 const fingerprint=btoa(String.fromCharCode(...digest));
 if(fingerprint!==workerSha256)throw new Error("PDF worker integrity check failed");
}
/** PDF worker is not an HTML script; verify its bytes with WebCrypto before executing. */
function verifiedPdfWorker():Promise<string>{
 if(trustedWorker)return trustedWorker;
 trustedWorker=(async()=>{
  const url="https://cdn.jsdelivr.net/npm/pdfjs-dist@"+version+"/build/pdf.worker.min.js";
  const response=await fetch(url,{mode:"cors",cache:"force-cache"});
  if(!response.ok)throw new Error("PDF worker unavailable");
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>3*1024*1024)throw new Error("PDF worker is unexpectedly large");
  await verifyPdfWorkerBytes(bytes);
  return URL.createObjectURL(new Blob([bytes],{type:"text/javascript"}));
 })().catch(error=>{trustedWorker=undefined;throw error;});
 return trustedWorker;
}
let loading:Promise<void>|undefined;
function ensurePdfJs(){
 if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{
  const script=document.createElement("script");
  script.src="https://cdn.jsdelivr.net/npm/pdfjs-dist@"+version+"/build/pdf.min.js";
  script.crossOrigin="anonymous";script.integrity=pdfScriptIntegrity;
  script.onload=()=>resolve();script.onerror=()=>reject(new Error("PDF.js CDN unavailable"));
  document.head.append(script);
 }).catch(error=>{loading=undefined;throw error;});
 return loading;
}
export async function extractPdf(file:File):Promise<string>{
 await ensurePdfJs();
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const pdfjs=(window as any).pdfjsLib;
 if(!pdfjs)throw new Error("PDF.js not available");
 pdfjs.GlobalWorkerOptions.workerSrc=await verifiedPdfWorker();
 const bytes=new Uint8Array(await file.arrayBuffer());
 const doc=await pdfjs.getDocument({data:bytes}).promise;
 if(doc.numPages>40)throw new Error("PDF exceeds 40 page limit");
 const parts:string[]=[];
 for(let page=1;page<=doc.numPages;page++){
  const data=await (await doc.getPage(page)).getTextContent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parts.push(data.items.map((item:any)=>item.str||"").join(" "));
  if(parts.join("\n").length>30000)break;
 }
 const text=parts.join("\n").trim().slice(0,30000);
 if(text.length<15)throw new Error("PDF contains no selectable text (OCR not supported)");
 return text;
}
