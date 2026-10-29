# Interview Simulation

Open-source, self-hosted mock interview web application.

**Default experience: a simplified AI interview at `/live` (also opened from `/`). The original P0 offline demo is available at `/demo`.** P0 requires no paid keys. Live mode supports CV/JD-driven planning, inline revisions, automatic server-side approval on Start, Azure Speech STT/TTS, follow-up questions and optional hints; it needs your LLM/Azure credentials. Production cloud interoperability has not yet been validated with real subscriptions. P4 scoring and independent audit ZIP are not implemented.

## Architecture

- pnpm workspace / Node 22 LTS / Next.js App Router / strict TypeScript
- React, Tailwind v4, domain state machine in `packages/interview-core`
- Single-process SQLite (WAL) with Drizzle ORM, Better Auth local accounts
- No database service, queues, microservices, paid AI keys or WebRTC required to try the demo

See the [simplified live interview flow](docs/ui/SIMPLIFIED_LIVE_FLOW.md), [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md), [P0 delivery plan](docs/plans/P0_FOUNDATION_IMPLEMENTATION_PLAN.md), [UI screen specification](docs/ui/SCREEN_SPEC.md), [SVG storyboard](docs/ui/mockups-overview.svg) and [offline clickable prototype](docs/ui/prototype.html).

## Local quickstart

Requirements: Node.js 22 LTS, Corepack (or an existing pnpm 10 installation).

```bash
corepack enable
pnpm install
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
# Paste the generated secret into BETTER_AUTH_SECRET in .env
pnpm db:migrate
pnpm dev
```

Open http://localhost:3000, sign in, add a JD and CV, generate an AI script and press **Start AI meeting**. AI calls require a configured provider. The offline P0 flow remains at http://localhost:3000/demo and needs no paid keys. Existing scenario revisions and typed answers persist after a refresh or server restart.

**Lockfile:** `pnpm-lock.yaml` is committed. CI should use `pnpm install --frozen-lockfile` with read-only repository permissions and no cloud secrets.

## Docker Compose

```bash
cp .env.example .env
# Set a strong BETTER_AUTH_SECRET in .env
docker compose up -d --build
```

One container serves Next and SQLite. `interview_data` named volume is persistent. Use HTTPS through a reverse proxy for public hosting and back up both the SQLite DB and uploaded artifacts before upgrading. SQLite is **single writer/single service only**. No Vercel ephemeral file system deployments.

## Demo behavior

Create scenario from JD → revise and explicitly approve the latest immutable version → set AI spoken language and voice independently of candidate input/STT language → explicitly consent to storing transcript → Start → answer by text → pause/resume/end → inspect history/events. The preflight mic and voice preview are *mock buttons*; neither asks browser permission nor records audio. Typed answers are durable and requests have idempotency keys; reusing a key with a different answer returns HTTP 409. P0 emits `preflight.demo_skipped` instead of claiming a real microphone check passed. Scripted interviewer question text respects the selected language (English or Vietnamese), while the candidate input locale remains independent. Each demo session accepts at most 15 answers.

**Live P1–P3:** Set `OPENAI_API_KEY` and `AI_MODEL` (OpenAI-compatible JSON-mode Chat Completions; optional `LLM_BASE_URL`). Set `AZURE_SPEECH_REGION` and `AZURE_SPEECH_KEY` to enable browser voice; otherwise select text-only fallback. Open `/live` (the signed-in default), upload CV PDF/DOCX/TXT/MD or paste text, generate a plan and press **Start AI meeting**. The UI approves the latest revision automatically; optional plan preview, revision and language/voice preferences stay collapsed on the same setup page. If Azure is absent, typed mode is selected automatically. PDF is extracted locally in browser via pinned PDF.js; DOCX is parsed server-side in memory. Scanned PDFs require OCR externally. The model receives extracted CV text and JD; Azure receives voice audio when enabled. No raw audio is stored here. P4 evaluation and audit ZIP are still pending.

## Privacy and security

Your self-hosted operator manages database backups and retention. There is no automated retention or `RETENTION_DAYS` setting. The live UI includes an explicit account-owned interview-data deletion action that cascades over scenarios, CV text, sessions, turns and event evidence. Better Auth enforces local account login, and demo API endpoints verify server-side ownership. Transcript consent starts **unchecked**. Raw audio is off. Demo service does not receive CV binary and does not upload audio to Azure. Run public deployments behind TLS and set a unique strong secret; avoid sharing `.env`, databases, transcripts or CVs.

## Open source / contributing

Licensed under [Apache-2.0](LICENSE). Feature contributions and tests are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Core code is open source, but real AI/voice providers have separate credentials, prices and terms.

## AI provider and language preferences

Sign in and open **/settings**. This account-owned page stores an AI provider, model, default interviewer language/voice, and default candidate speech language in SQLite. Saved preferences drive live scenario planning, revisions, questions and hints. The streamlined meeting starts with saved language/voice defaults; you can override them under optional meeting preferences on the setup page. The offline P0 demo does not call AI.

### CLI-first, operator opt-in

Set `ENABLE_LOCAL_AI_CLI=true` on a trusted self-hosted installation. Install and authenticate `codex` and/or `agy` as the OS user running Next.js. New accounts default to Codex when available, then Agy. The Codex list follows `auto-dev-workflow/packages/adapters/codex-local/src/index.ts`. Agy models are discovered from the installed CLI with a documented fallback. Model names can also be entered manually.

Codex is invoked with `codex exec --json --sandbox read-only --skip-git-repo-check`, and Agy uses `--input-format stream-json --output-format stream-json --sandbox`, both with user data on stdin, no shell, temporary working directory, bounded output and a 90-second timeout. Availability checks verify installation, **not** authentication. The Docker image does not bundle or authenticate Codex/Agy, so build a private runtime image if CLI support is needed.

**Security:** CLI processes run with the server operating-system account's permissions and shared host login. Do not enable this mode for publicly accessible self-registration. Isolate the host account/container and network access; CLI sandbox controls are defense in depth rather than per-user isolation. Web app secrets are omitted from subprocess environments.

### Existing API-key provider

The server-side `OPENAI_API_KEY`, `AI_MODEL` and optional `LLM_BASE_URL` path remains supported. Select **API key** in Settings to use it; account settings can override the default model. Keys are not read or stored by the browser or SQLite. **TODO:** secure per-account API-key management through this settings page; this PR deliberately keeps the existing server environment approach.

CLI auth with real accounts and Azure voice remain external smoke-test requirements.


## Test Codex, Agy and Azure without an interview

Sign in and open **/settings/test** from Settings. To enable paid smoke tests on a trusted host set `ENABLE_PROVIDER_TESTS=true` (and `ENABLE_LOCAL_AI_CLI=true` for local CLI) and restart. The page separately checks Codex CLI, Agy CLI, Azure token exchange, real Azure TTS voice preview, browser microphone/speaker and Azure STT. It does not save transcripts or credentials. These checks require real provider authentication and are **not** asserted by CI. **Disable the test flag after finishing** if exposing the server to untrusted accounts. See [provider diagnostics](docs/provider-diagnostics.md).
