# Interview Simulation

Open-source, self-hosted mock interview web application.

**Current phase: P0 demo foundation.** This runs a real Next.js + Better Auth + SQLite application, with deterministic mock interviewer questions, explicit scenario approval, independent speech settings and durable text-based interviews. It **does not** connect to an LLM or Azure Speech yet and does not claim to score real candidates.

## Architecture

- pnpm workspace / Node 22 LTS / Next.js App Router / strict TypeScript
- React, Tailwind v4, domain state machine in `packages/interview-core`
- Single-process SQLite (WAL) with Drizzle ORM, Better Auth local accounts
- No database service, queues, microservices, paid AI keys or WebRTC required to try the demo

See [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md), [P0 delivery plan](docs/plans/P0_FOUNDATION_IMPLEMENTATION_PLAN.md), [UI screen specification](docs/ui/SCREEN_SPEC.md), [SVG storyboard](docs/ui/mockups-overview.svg) and [offline clickable prototype](docs/ui/prototype.html).

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

Open http://localhost:3000, create a local demo account and follow the screens. Existing scenario revisions and typed answers persist after a refresh or server restart.

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

**No AI/voice guarantee**: P1 adds CV parsing and real LLM scenario generation; P2 adds Azure Speech browser STT/TTS, preflight hardware checks and durable voice turns; P3 adds adaptive questioning and hints; P4 adds evidence-scored reports and external audit ZIP. These later phases require the applicable third-party credentials/billing.

## Privacy and security

Your self-hosted operator manages database backups and retention. P0 does not implement automated retention, a deletion UI or a `RETENTION_DAYS` setting. Better Auth enforces local account login, and demo API endpoints verify server-side ownership. Transcript consent starts **unchecked**. Raw audio is off. Demo service does not receive CV binary and does not upload audio to Azure. Run public deployments behind TLS and set a unique strong secret; avoid sharing `.env`, databases, transcripts or CVs.

## Open source / contributing

Licensed under [Apache-2.0](LICENSE). Feature contributions and tests are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Core code is open source, but real AI/voice providers have separate credentials, prices and terms.
