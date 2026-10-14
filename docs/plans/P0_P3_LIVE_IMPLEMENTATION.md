# P1-P3 live feature (PR #3)

## Run
Install and migrate using README. Keep the P0 offline demo available on /. Visit /live after sign-in. For live AI set server-only OPENAI_API_KEY and AI_MODEL; optional LLM_BASE_URL is an operator-trusted OpenAI-compatible HTTPS endpoint. For voice add AZURE_SPEECH_REGION and AZURE_SPEECH_KEY. Use HTTPS or localhost to grant mic permission.

## Flow
1. JD + CV upload: TXT/MD/DOCX parsed on server; PDF parsed in-browser using pinned PDF.js. Extracted CV text and scenario history stored in SQLite.
2. LLM constructs Zod-checked stages and rubric; revision creates a fresh unapproved snapshot, approval is mandatory.
3. Interviewer output language/voice and candidate STT language are independent. Catalog fetched from user's Azure region. Preflight tests real mic and speaker, or user explicitly chooses typed-only.
4. Single active question at a time, persisted before display. Browser Azure Speech can speak and recognize once. Client STT provenance is labelled unverified. The candidate can correct text before committing with question ID + idempotency key.
5. Follow-up questions depend on rubric and prior answers. Coaching hints are independently generated and logged as hint.exposed. All state and events survive refresh.

## Boundaries
- P0 deterministic demo stays offline. P1-P3 require network/provider resources; CI exercises offline/no-credentials paths only.
- Billing limits: existing account quota caps scenarios and sessions and 15 answers/interview; a pre-LLM quota check reduces paid abuse. Place behind reverse proxy spend protections if public.
- Provider adapter uses OpenAI-compatible REST today; Vercel AI SDK provider package may replace this adapter without changing @interview/core ports.
- Azure Speech SDK is loaded via pinned CDN, not bundled. For air-gapped deployments host assets locally. Azure key never reaches the browser, only a short-lived token scoped by region.
- Sensitive CV and transcript strings are omitted from operational logs. Raw audio is not recorded. Explicit delete-my-data action erases scenarios and their dependent records.
- No scoring, independent workflow audit, evidence ZIP or production credential-based E2E until P4. Formal WCAG audit, shadcn UI parity and backup restore drill still pending P0 sign-off.
