# Technical Architecture Proposal — Interview Simulation

**Status:** PROPOSED / AWAITING MAINTAINER APPROVAL  
**Date:** 2026-10-13  
**Scope of this PR:** Architecture and implementation plan **only**. No application code, dependency installation, infrastructure provisioning, or secrets.

## 0. Goals and non-goals

Build a **public, self-hostable, contributor-friendly** AI mock-interview web app. A developer should be able to clone it, configure credentials, and run it with pnpm or one Docker Compose command.

Required user flow:
1. Candidate enters/pastes a Job Description (JD), uploads a CV (PDF/DOCX), and optionally supplies their own profile/history.
2. Scenario Planner Agent derives interview role/level/tech stack, interviewer persona, stages, evaluation rubric, planned questions and reference-answer guidelines. Candidate can discuss and revise the draft in chat, then **explicitly approves an immutable version**.
3. Candidate performs a microphone/speaker test and starts a meeting-like interview. An AI interviewer uses Azure Speech STT/TTS and asks adaptive follow-up questions that stay aligned with the approved scenario.
4. An optional, separately displayed Answer Hint Agent uses JD, CV, verified user context, prior answers, and **the interviewer question just spoken** to suggest a response.
5. System retains ordered question/answer history, timestamps, approved scenario version, assistant decisions, and system event logs.
6. After completion, an **independent Evaluation Agent** creates an evidence-linked candidate report and an **independent Workflow Audit Agent** checks orchestration policy/events. User can export a redacted audit bundle for an external reviewer.

Non-goals for v1: physical multi-party meetings, WebRTC conferencing, streaming candidate video to an LLM, photorealistic avatar, browser code execution, automatic hiring decisions, Kubernetes, microservices, enterprise SSO, multi-region active-active, production-grade model fine-tuning.

## 1. Proposed decisions — approve these BEFORE implementation

| ADR | Area | Proposed choice | Why / limits |
|---|---|---|---|
| ADR-001 | Repo/runtime | **pnpm workspace; Node.js 22 LTS or newer supported LTS, pinned via engines/Corepack** | One language/toolchain; exact patch and pnpm major pinned during scaffolding |
| ADR-002 | App/API | **Next.js App Router + React + TypeScript (strict)** | One deployable app for pages, REST endpoints, and optional SSE; no separate NestJS |
| ADR-003 | Styling | **Tailwind CSS + shadcn/ui** | Source-owned UI components; familiar contributor ergonomics |
| ADR-004 | Architecture | **Modular monolith; domain-centric modules + typed ports/adapters** | Simple deploy yet clean AI/Speech/DB boundaries; no generic agent framework |
| ADR-005 | Persistence | **SQLite + Drizzle ORM + better-sqlite3** | Zero DB service for local/self-host single instance; explicit SQLite limits below |
| ADR-006 | User auth | **Better Auth (Drizzle + email/password)** | Multi-user ownership, secure sessions; validate exact supported versions before coding |
| ADR-007 | LLM | **Vercel AI SDK as an adapter, Zod for structured output** | Start with OpenAI-compatible provider; provider implementation swappable; Azure OpenAI next |
| ADR-008 | Speech | **Azure Speech JS SDK on browser, server-issued short-lived tokens** | Required Azure STT/TTS, without browser access to subscription secret |
| ADR-009 | Realtime | **Turn-based HTTP request + SSE when useful, browser-side continuous STT and TTS** | Avoid mandatory WebSocket/RTC backend until latency testing shows need |
| ADR-010 | Logs | **Pino JSON logs + append-only DB event journal, correlation IDs** | Auditable without ELK, Kafka or external monitoring service |
| ADR-011 | Deploy | **Single Docker container + persistent volume; optional reverse proxy** | Minimal operational footprint; localhost via pnpm |
| ADR-012 | Open source | **Apache-2.0 proposed, conventional commits, CI, docs, examples** | Clear contribution/reuse terms and license patent grant; add LICENSE only after approval |

**Default operating mode: single Node process, one writable SQLite volume, one application instance.** This is deliberately *not* a horizontal-scale/serverless design. Production-like high-concurrency deployment is a later, separate ADR requiring PostgreSQL and a durable worker/queue.

### Explicit trade-off: SQLite vs PostgreSQL

Choose SQLite for v1 to keep the 5-minute local bootstrap realistic. Enable WAL, busy timeout, foreign keys, indexes, transactional event writes, one writable app instance, volume backups, schema migrations. Do **not** promise multi-instance writes, network-shared SQLite, autoscaling replicas, or database portability by changing only a URL. If the project later moves to PostgreSQL, implement and test a deliberate dialect/schema migration, not a speculative second DB abstraction now.

### Explicit trade-off: meeting UX vs RTC

The UI **looks/behaves like an online meeting**, but the participant speaking is a locally rendered AI tile plus the candidate. Browser Azure STT streams recognized segments; the backend decides the next turn; browser Azure TTS speaks it. No video conference is needed. Initial voice mode is *half-duplex*, with user-controlled end-of-answer / configurable silence detection; interruption/barge-in and live audio duplex are future enhancements. User should not confuse this with a true peer-to-peer video call.

## 2. Recommended repository layout

Keep the workspace intentionally small; avoid a package for every class.

    interview_simulation/
    ├── README.md
    ├── LICENSE                         # after approval
    ├── CONTRIBUTING.md                 # during scaffold phase
    ├── CODE_OF_CONDUCT.md              # during scaffold phase
    ├── SECURITY.md                     # during scaffold phase
    ├── .env.example
    ├── .gitignore
    ├── .nvmrc                          # or .node-version
    ├── package.json                    # private workspace root, scripts
    ├── pnpm-workspace.yaml
    ├── pnpm-lock.yaml                  # committed
    ├── Dockerfile
    ├── compose.yaml
    ├── .github/workflows/ci.yml
    ├── docs/
    │   ├── TECHNICAL_ARCHITECTURE.md   # this approved proposal
    │   ├── development.md
    │   ├── deployment.md
    │   ├── ai-provider.md
    │   └── decisions/                   # ADRs only if decisions change
    ├── apps/
    │   └── web/
    │       ├── app/                     # pages, layouts, route handlers
    │       ├── src/
    │       │   ├── features/            # scenario, meeting, reports, history
    │       │   ├── components/
    │       │   ├── lib/speech/          # browser Azure STT/TTS adapter
    │       │   └── server/
    │       │       ├── auth/
    │       │       ├── db/              # Drizzle schema + migrations
    │       │       ├── interviews/      # use cases, policy, repositories
    │       │       ├── scenarios/
    │       │       ├── agents/          # planner, interviewer, hint, evaluator, auditor
    │       │       ├── providers/       # LLM/speech token adapters
    │       │       └── observability/   # events, tracing, redaction
    │       └── tests/
    └── packages/
        └── interview-core/             # pure TS/Zod domain types/state machine

Only create other packages or apps after a concrete reuse need; do not add Turborepo/Nx initially. The domain package cannot import Next.js, a DB driver, or an AI provider. Application routes are thin adapters to server use cases; no business policy in React components.

## 3. Local quickstart and deploy contract (target, after code lands)

Developer prerequisites: Node LTS, Corepack/pnpm; Azure Speech resource and at least one supported LLM API key for live voice. No local Docker or running DB required to develop.

Target commands:

    git clone https://github.com/tnkttruong/interview_simulation.git
    cd interview_simulation
    corepack enable
    pnpm install --frozen-lockfile
    cp .env.example .env
    pnpm db:migrate
    pnpm dev

Production/self-host target:

    cp .env.example .env
    docker compose up -d --build

Compose should start **one web service with a persistent volume** (SQLite and permitted local artifacts). Migration is explicit or a safely serialized startup step; publish a backup-and-restore procedure. Run behind HTTPS/reverse proxy for public use. Never advertise Vercel/ephemeral serverless as compatible with a local SQLite file.

Target root scripts: dev, build, start, lint, typecheck, test, test:e2e, db:generate, db:migrate, db:studio (optional), check. Ensure a fresh checkout passes deterministic checks; install native better-sqlite3 correctly in pnpm/Docker and confirm Next standalone packaging in CI.

Required environment variables **to document** (illustrative names; final names locked in scaffold PR):
- APP_URL, AUTH_SECRET, DATABASE_URL (local file path), DATA_DIR.
- AI_PROVIDER, AI_MODEL, provider-specific server-only API key; optionally AZURE_OPENAI_ENDPOINT/API_VERSION.
- AZURE_SPEECH_REGION, AZURE_SPEECH_KEY, SPEECH_LANGUAGE, SPEECH_VOICE.
- LOG_LEVEL, RETENTION_DAYS, MAX_UPLOAD_MB.
- Optional DEMO_MODE to preview *scripted/text-only* interaction without paid APIs; never imply it runs real LLM/voice.

Explicit startup validation: missing live-mode keys produces actionable configuration errors. .env never committed, no credentials in client bundle/logs, support example/fake adapter in tests.

## 4. Application architecture and boundaries

    Browser (Next.js UI)
      |-- Document/scenario review + chat
      |-- Mock meeting screen; Azure Speech STT/TTS (temporary auth token)
      |-- Answer hint panel (explicit assisted-mode badge)
      |-- Interview history, reports, audit download
      |
      v HTTPS REST / optional SSE
    Next.js Route Handlers [auth + validation + rate limits]
      |
      v Use Cases / Interview Orchestrator (deterministic)
      |-- Document ingestion (JD/CV as untrusted input)
      |-- Scenario Planner Agent ---> immutable approved scenario
      |-- Interviewer Agent -------> next question
      |-- Hint Agent -------------> private hint panel (not interviewer)
      |-- Evaluation Agent --------> evidence-linked report
      |-- Audit Agent -------------> workflow audit
      |
      +-- LLM Provider port [AI SDK adapter]
      +-- Persistence port [SQLite/Drizzle]
      +-- Observability port [event journal + Pino]
      +-- Storage port [local volume; cloud adapter future]

**Agents decide content; deterministic orchestration decides authority.** No agent may silently approve a scenario, mutate a frozen transcript, bypass access control, or change state directly. No general-purpose autonomous agent/harness framework needed. Model/provider fallback must not change policy, schema, or approval rules.

Provider ports (example contracts):
- LlmGateway.generateStructured(schema, systemPrompt, data, modelConfig) → typed result + usage/model metadata.
- SpeechClient.startRecognition()/stopRecognition()/speak()/cancel(), implemented in browser Azure adapter; server endpoint creates ephemeral speech token after auth.
- InterviewRepository.load()/commitTurn()/appendEvent() → transactions and optimistic concurrency controls.
- EvidenceExporter.export(sessionId, privacyPolicy) → manifest + data or controlled ZIP.

Version prompts, schema formats and rubric. Agents return **Zod validated** structured objects; bad model output triggers bounded retry / explicit error, not an invented question or corrupted DB row.

## 5. Workflow state machine

Scenario:
- DRAFT -> REVISING -> DRAFT (new numbered revision) -> APPROVED.
- Approval binds the exact scenario JSON, rubric, role, tech stack, question coverage and prompt/template version to an immutable snapshot.
- Editing an approved plan creates a **new draft/version**; never silently mutates an already approved session.

Interview:
- CREATED -> PREFLIGHT -> READY -> IN_PROGRESS -> COMPLETED -> EVALUATING -> EVALUATED.
- Exceptional: PAUSED, INTERRUPTED, FAILED, CANCELED. Resume only from validated durable state; terminal states are final.
- Each API transition checks owner/authorization, expected state/version, and idempotency key.
- Store approved scenario ID/version on every session. Model versions/prompts can change globally without altering already captured evaluation evidence.

A turn:
1. Orchestrator chooses planned topic + completion/coverage constraints.
2. Interviewer model generates **one** interviewer utterance, mapped to competency/question source, along with rationale kept internal.
3. Persist question + generation event BEFORE returning speech text; browser synthesizes it and confirms speaking started/completed where possible. Failed/dropped TTS remains visible as delivery status.
4. STT receives partial text (transient UI) and final text. Candidate explicitly completes answer or silence policy finalizes it. Preserve timestamps, confidence when available and transcript-edit provenance.
5. Persist answer and any assistance usage **transactionally** with turn events. Use clientTurnId and expected revision so duplicate requests/reconnects do not create extra questions.
6. Generate next utterance based on **approved scenario + previous answer + recent session memory + uncovered skills**. Use bounded context summarization with attributable sources; no fabricated candidate facts.
7. End by timer/policy/user action, freeze transcript, evaluate from immutable evidence.

No unlimited recursive agent loop. Define max turn count, turn timeout, token budget, retry ceiling and predictable failure handling.

## 6. Hints, scoring and fairness

Answer Hint Agent inputs: the actual question *just asked/spoken*, JD and CV parsed evidence with source references, previously verified candidate profile, recent conversation, target rubric and desired level. Output: short answer outline, relevant user-experience pointers, possible technical reasoning, uncertainty/source tags. Never fabricate achievements, certifications, employers or projects.

Hint modes: OFF (default for realistic scoring), ON_DEMAND, COACHING. User must opt in, and usage is captured per turn. **Private hints are never fed back into interviewer prompts as candidate answers.**

Evaluation is a separate agent, launched only on a frozen session; produce per-competency evidence, cited turn IDs, calibrated confidence, improvement suggestions and disclosed hint usage. Score technical accuracy + depth + communication + scenario coverage according to approved rubric. A session with missing evidence must be marked insufficient, not scored as a definitive failure. Candidate-controlled training tool, not a hiring gate.

## 7. Database design (v1 SQLite, Drizzle)

Minimum tables/records:
- auth user/session/account records (Better Auth schema).
- candidate_profiles; uploaded_documents (owner, MIME, size, stored path, parse status, source hash).
- interview_scenarios (owner, revision, draft/approved status, persona, interview stages, questions, rubric JSON, timestamps).
- scenario_chat_messages (user/agent messages, edit target/revision).
- interview_sessions (owner, approved scenario version, policy flags, current state, optimistic version, time limits).
- interview_turns (session ID, sequence, question, answer, source evidence IDs, recognized text, question delivery status, timestamps).
- interview_hints (turn ID, mode, displayed/used flag, content and provenance).
- evaluations (session and frozen evidence version, scores, citations, model/prompt info).
- workflow_events (append-only sequence, event ID, session ID, trace ID, type, sanitized payload, timestamp, schemaVersion).
- agent_runs (agent type, model/provider/version, prompt/template version, input/output hashes, token usage, duration, outcome, errors).
- audit_reports + export_jobs (manifest/schema version, detected findings, status).

Foreign keys and ownership checks on **every read/write/export**, not just pages. Define retention/delete cascade for user data; use redaction rules for exports. Sensitive CV/transcript **not duplicated into application logs**.

Persistence implementation requirements:
- Migrations committed and reviewed, no schema auto-sync in production.
- WAL, foreign keys, busy timeout, explicit single-writer deployment assumption.
- Unique(session_id, turn_seq), unique(session_id, client_turn_id) / idempotent write keys; atomic state/event commits.
- Encrypted transport, restricted filesystem permissions, optional disk encryption at host level; no claim of built-in at-rest encryption from plain SQLite.
- Backups use a SQLite-consistent method and include uploaded files/metadata.

## 8. Auditability, replay and exports

Write **two distinct** channels:
1. Operational Pino JSON logs to stdout: request/trace IDs, level, duration, sanitized error codes, retry counters, latency and cost. Log forwarding is optional.
2. Append-only **business/workflow event journal** in DB: actor, aggregate/session ID, previous/current state, scenario version, event schema version, agent run reference, timestamp, correlation/causation IDs.

Suggested event types: scenario.created, scenario.revised, scenario.approved, preflight.passed, interview.started, question.generated, question.tts_started, question.tts_completed, answer.stt_final, answer.committed, hint.viewed, interview.ended, evaluation.completed, audit.completed, retry.scheduled, step.failed, export.created.

Independent audit checks: every interview started from approved immutable snapshot; legitimate transitions; monotonic turns; no duplicate questions from request retries; no missing finalized answers/evidence; model outputs validated; disclosure of hints; no gaps between planned coverage and actual scope; no silent state mutation.

Target downloadable ZIP structure:

    manifest.json               # schema version, versions, SHA-256 hashes
    index.md                    # human-readable overview + replay guide
    scenario/approved.json
    interview/turns.jsonl
    agent-runs/runs.jsonl
    workflow/events.jsonl
    evaluation/report.json
    audit/report.json
    system/logs.redacted.jsonl  # optional bounded export, not global raw stdout
    documents/sources.json      # references/hashes, NOT raw CV by default

Export filter: user/project/session/date range as relevant; size/row cap + streaming or paginated export, informative errors, strict user ownership. Privacy-first redaction. Audio/CV not included unless explicit consent/authorized opt-in. Audit package must be understandable to a **standalone external AI agent** without live database access. Hashes enable integrity checks but are not proof of tamper resistance against a privileged server operator.

## 9. Security, privacy, limits

- Browser never receives LLM API keys or Azure Speech subscription key. Authenticated backend issues temporary Azure speech credentials only after quota/rate checks; never log token value.
- Validate JD/CV size/MIME/content. Strip executable content; PDFs/DOCX treated as untrusted data. Defend against prompt injection from candidate uploads, JD and transcript.
- Authenticated session and per-record owner checks; CSRF protections for cookie-based requests; safe upload locations; no public filesystem serving of CVs.
- Azure Speech cost controls, LLM token and max-duration quotas, request rate limits, prompt-size limits and retry caps; self-host operator configures limits.
- Export and delete controls, retention defaults, consent gate for stored transcript and separate opt-in for audio recordings. **Audio recording OFF by default**; transcript retention and delete policy clearly shown.
- For licensed open-source libraries/providers, document their actual terms. AI model usage and Azure Speech are external paid/credentialed services even though the code is open source.

## 10. Reliability and testing strategy

Tests expected as part of implementation PRs:
- Pure state-machine transition tests and scenario version immutability tests.
- Schema validation, malformed model response, retry exhaustion, prompt injection inputs.
- STT partial/final deduplication, stop/interrupt behavior, TTS delivery reconciliation, network disconnect/reconnect.
- Turn idempotency; duplicate clientTurnId and concurrent submit do not fork conversation; guaranteed ordered storage.
- Agent instruction boundaries: interviewer cannot read private hints; evaluator cannot change evidence; auditor cannot mutate history.
- Replay: frozen session + event journal => deterministic state/coverage reconstruction (LLM content itself isn't deterministic; no promise of identical model output).
- Permission tests: cross-user document/session/export access rejected; token endpoint auth and quotas.
- SQLite migration against fresh DB; backup/restore on real volume; Docker cold start and restart.
- Full happy-path E2E with mock providers (no paid services or microphone required in CI), optional live Azure smoke test behind maintainers' secrets.

CI gates: pnpm frozen install, lint, typecheck, unit/integration, build, E2E smoke, dependency/security scan; no mandatory secret requirement for contributor CI. Pin action SHA where practical and use minimal GitHub Actions permissions.

## 11. OSS contributor experience

After architecture approval, first implementation PR should deliver:
- Apache-2.0 LICENSE (if approved), README with screenshots/diagram/architecture trade-offs, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates and changelog policy.
- .env.example with safe placeholder names and validated error messaging.
- Local quickstart, text-only DEMO_MODE for contributors without Azure/LLM credentials, scripted fixtures, one-command Docker Compose.
- Architecture docs (this file remains source of truth), typed public contracts for agents/providers, dependency update policy.
- Conventional commits; semantic versioning once public releases begin; no "works on Vercel/serverless" promises with local SQLite.
- Clear path for custom LLM provider and language/voice adapters, documented extension points rather than undocumented monkeypatching.

## 12. Incremental delivery plan (separate PRs after approval)

**P0 — OSS foundation:** pnpm workspace, Next app, core package, SQLite/Drizzle migrations, Better Auth, Docker/Compose, docs, mock providers, CI. Acceptance: fresh clone -> pnpm dev and docker compose -> healthy UI; no paid keys needed in DEMO_MODE.

**P1 — Scenario planning:** JD/CV upload + parse, planner structured outputs, review chat and versioned approval. Acceptance: revisions immutable, only approved plan can start.

**P2 — Voice meeting:** Azure token exchange, mic/browser STT, TTS, turn orchestrator, meeting UI, durable transcript, pause/resume/reconnect. Acceptance: real English voice interview with reliable ordered history and no secrets in client.

**P3 — Dynamic questioning + hints:** coverage/follow-up control, hint modes, latency/cost controls, session memory. Acceptance: follow-up references previous answer; hints cite user evidence and display assistance status.

**P4 — Evaluation + audit:** frozen transcript scoring, workflow policy replay, redacted evidence ZIP, UI reports. Acceptance: independent auditor can inspect bundle offline and detect injected invalid transitions.

**P5 — Hardening:** security/privacy review, failure simulation, backup/restore, contribution cleanup, public release.

Each PR includes tests + migration/docs updates when applicable. No huge single PR. Stop after this architecture proposal and wait for approval before P0.

## 13. Open decisions requiring maintainer confirmation

Please explicitly approve or request changes for:
1. **[ ] Next.js full-stack modular monolith** instead of Next.js + NestJS split backend.
2. **[ ] SQLite first + single-instance Docker** instead of PostgreSQL-required deployment.
3. **[ ] Half-duplex Azure Speech browser MVP** instead of WebSocket/WebRTC full-duplex.
4. **[ ] Provider adapter via Vercel AI SDK**, initial OpenAI-compatible LLM with Azure OpenAI extension.
5. **[ ] Better Auth local email/password** for multi-user self-host.
6. **[ ] Apache-2.0 license** (alternative MIT).
7. **[ ] Transcript always saved with informed user consent; raw audio off by default.**
8. **[ ] No code changes before plan approval**, P0 separate PR.

## 14. Reference docs (for future implementation validation)

- Next.js route handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Next.js self-hosting/Docker: https://nextjs.org/docs/app/guides/self-hosting
- Drizzle SQLite setup: https://orm.drizzle.team/docs/get-started/sqlite-new
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Azure JS SpeechRecognizer continuous recognition: https://learn.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognizer
- Microsoft Azure STT: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-recognize-speech?pivots=programming-language-javascript
- Azure React example (archived; use as reference only): https://github.com/Azure-Samples/AzureSpeechReactSample

---
**Review gate:** This document is a proposed architecture. Approval authorizes P0 planning/implementation in a **new PR**, not an unreviewed change to deployed code.
