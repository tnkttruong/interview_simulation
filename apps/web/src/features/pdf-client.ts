"use client";
// Client-only PDF text extraction; no raw PDF leaves the browser.
// PDF.js v3 classic distribution exposes pdfjsLib as window global.
// Self-hosted pdfjs-dist 3.11.174 under public/vendor/pdfjs (see README there).
const base="/vendor/pdfjs/";
let loading:Promise<void>|undefined;
function ensurePdfJs(){
 if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{
  const script=document.createElement("script");
  script.src=base+"pdf.min.js";
  script.onload=()=>resolve();script.onerror=()=>{loading=undefined;reject(new Error("PDF.js failed to load"));};
  document.head.append(script);
 });
 return loading;
}
export async function extractPdf(file:File):Promise<string>{
 await ensurePdfJs();
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const pdfjs=(window as any).pdfjsLib;
 if(!pdfjs)throw new Error("PDF.js not available");
 pdfjs.GlobalWorkerOptions.workerSrc=base+"pdf.worker.min.js";
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
