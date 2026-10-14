# Vendored browser assets

Self-hosted so the app works on intranet / air-gapped networks and never executes third-party scripts at runtime.

| Path | Package | Version | License |
|---|---|---|---|
| `pdfjs/pdf.min.js`, `pdfjs/pdf.worker.min.js` | [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) `build/` | 3.11.174 | Apache-2.0 |
| `azure-speech/microsoft.cognitiveservices.speech.sdk.bundle-min.js` | [`microsoft-cognitiveservices-speech-sdk`](https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk) `distrib/browser/` | 1.52.0 | Microsoft (see package LICENSE) |

To upgrade, download the same files from the new package version (e.g. `https://cdn.jsdelivr.net/npm/<pkg>@<version>/...`),
replace them here and update this table. The Azure SDK still talks to Azure Speech endpoints at runtime (token is issued by the server).
