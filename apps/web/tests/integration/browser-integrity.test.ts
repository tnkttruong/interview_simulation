import {describe,expect,it} from "vitest";
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";

describe("self-hosted browser assets",()=>{
 it("ships the vendored PDF.js and Azure Speech bundles",()=>{
  for(const file of ["pdfjs/pdf.min.js","pdfjs/pdf.worker.min.js","azure-speech/microsoft.cognitiveservices.speech.sdk.bundle-min.js"])
   expect(existsSync(resolve(process.cwd(),"public/vendor",file)),file).toBe(true);
 });
 it("does not load executable scripts from a third-party CDN",()=>{
  for(const name of ["azure-client.ts","pdf-client.ts"]){
   const source=readFileSync(resolve(process.cwd(),"src/features",name),"utf8");
   expect(source).not.toMatch(/https?:\/\/cdn\./);
   expect(source).toContain("/vendor/");
  }
 });
});
