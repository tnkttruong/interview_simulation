import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {verifyPdfWorkerBytes} from "../../src/features/pdf-client";

describe("version-pinned browser asset integrity",()=>{
 it("rejects an altered PDF worker payload before constructing an executable blob URL",async()=>{
  const corrupted=new TextEncoder().encode("console.log('unexpected');").buffer as ArrayBuffer;
  await expect(verifyPdfWorkerBytes(corrupted)).rejects.toThrow("PDF worker integrity check failed");
 });
 it("uses SRI for the external Azure and PDF scripts",()=>{
  const azure=readFileSync(resolve(process.cwd(),"src/features/azure-client.ts"),"utf8");
  const pdf=readFileSync(resolve(process.cwd(),"src/features/pdf-client.ts"),"utf8");
  expect(azure).toContain("script.integrity=speechIntegrity");
  expect(pdf).toContain("script.integrity=pdfScriptIntegrity");
  expect(pdf).toContain("await verifyPdfWorkerBytes(bytes)");
 });
});
