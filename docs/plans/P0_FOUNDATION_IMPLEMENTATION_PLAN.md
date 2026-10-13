# P0 — Open-Source Foundation & UI-First Implementation Plan

**Status:** P0 executable foundation delivered in PR #1; unchecked items below remain roadmap/gaps, not completed claims
**Date:** 2026-10-13
**Repository:** https://github.com/tnkttruong/interview_simulation
**Architecture baseline:** [Technical Architecture](../TECHNICAL_ARCHITECTURE.md) (same PR)

## 1. Approved technology decisions

Maintainer explicitly approved all six choices on 2026-10-13:
1. Full-stack **Next.js App Router + TypeScript**, modular monolith; no NestJS service.
2. **SQLite + Drizzle** initially; **single-instance** self-host with durable volume, PostgreSQL only by later separate scaling ADR.
3. **Azure Speech JS SDK**, half-duplex interview for first speech MVP.
4. **Vercel AI SDK** behind LLM provider adapter, provider-agnostic domain code.
5. **Better Auth** for user authentication.
6. **Apache-2.0** open-source license for the codebase.

Additional architecture choices unchanged: **pnpm workspace**, **React**, **Tailwind + shadcn/ui**, **Zod**, **Vitest + Playwright**, **Pino structured logs**, **Docker + Compose**. No mandatory Redis, message broker, Kubernetes, WebRTC or agent framework in v1.

**Review sequencing:** Architecture, this plan, mockups and P0 foundation implementation are delivered together in PR #1. CI and acceptance tests gate merge.

## 2. What P0 does and does NOT do

Goal: a contributor can clone the repository, install once with pnpm, run a real Next.js UI shell and authenticated demo locally, or start it with one Docker Compose command. UI/UX must be clearly defined before feature code, including a mock meeting and preflight language/voice choice.

P0 includes **project foundation**: package manager, app shell, core domain types, config, DB/auth, mock providers, basic test strategy, CI, Docker, OSS documentation, and a reusable screen design system. Later PRs implement AI scenario creation, Azure Speech, real interview engine, evaluation and audit export.

**PR #1 includes architecture, UX design and P0 scaffold implementation.** Real AI generation, Azure Speech, scoring and ZIP export remain explicit follow-up phases P1–P4.

## 3. UX-first deliverables included in this PR

- [Nine-screen SVG storyboard](../ui/mockups-overview.svg) — quick, GitHub-renderable visual.
- [Interactive standalone HTML mockup](../ui/prototype.html) — open locally in any browser to click through nine screens, change languages/voice, preview approval state and meeting controls; no npm install needed.
- [UI screen specification](../ui/SCREEN_SPEC.md) — screen contracts, states, preflight policy, acceptance criteria.

Flow: Sign in → Dashboard → JD/CV form → Scenario review/chat/approve → **Preflight** → Live meeting ↔ pause/reconnect → Results → History/evidence/audit.

### Mandatory preflight UX decisions

The user chooses THREE independent settings on the screen immediately before Start Meeting:
- **Interviewer language** — locale used to generate and speak interviewer questions (LLM + TTS), e.g., en-US, vi-VN.
- **Interviewer voice** — locale-compatible Azure TTS voice, previewable; must be dynamically resolved and validated for Azure region in the real implementation.
- **Candidate spoken/input language** — Azure STT recognition locale, independent of interviewer language.

Example: interviewer en-US with Jenny voice; candidate STT vi-VN. The AI asks in English while the app recognizes candidate speech as Vietnamese; the LLM can interpret the Vietnamese answer and continue to ask in English. **No silent translation**; preserve original transcript.

Do not confuse the three with the **interface translation language**, which is a fourth optional setting. Preflight also presents mic/speaker check, transcript consent, raw-audio default OFF, and start gates. Choose fixed input locale for first voice MVP; continuous auto language-ID is later scope.

### Suggested typed contract for later implementation

    interface InterviewSpeechConfig {
      interviewerLocale: string;      // BCP-47; interviewer LLM output + Azure TTS language
      interviewerVoiceId: string;     // region/locale-compatible Azure TTS voice identifier
      candidateSttLocale: string;     // BCP-47; microphone/STT recognition only
      uiLocale?: string;              // interface labels only
      consentToTranscript: boolean;
    }

An approved session stores an immutable language/voice snapshot. User-facing preflight UI cannot secretly switch a selected input locale or TTS voice after approval.

## 4. Proposed P0 repo layout after implementation

    .
    ├── apps/
    │   └── web/
    │       ├── app/                   # Next App Router; thin route handlers
    │       ├── src/
    │       │   ├── features/          # S01..S09 page components
    │       │   ├── components/ui/     # Tailwind/shadcn UI
    │       │   ├── server/
    │       │   │   ├── auth/          # Better Auth
    │       │   │   ├── db/            # Drizzle schema/migrations
    │       │   │   ├── agents/        # pluggable typed interfaces (mock first)
    │       │   │   ├── interviews/    # state machine and use cases
    │       │   │   └── observability/ # Pino/event interfaces
    │       │   └── lib/
    │       └── tests/
    ├── packages/
    │   └── interview-core/           # Zod schemas/types/pure state machine
    ├── docs/                          # architecture, UX, setup, deploy
    ├── .github/workflows/ci.yml
    ├── .env.example
    ├── Dockerfile
    ├── compose.yaml
    ├── package.json
    ├── pnpm-workspace.yaml
    └── pnpm-lock.yaml

One deployable Next process. Keep all server-only secrets and DB access outside client code. The core package cannot import Next.js, Drizzle, Azure or model SDKs. Avoid monorepo orchestration dependencies (Turborepo/Nx) without demonstrated need.

## 5. P0 implementation slices, in order

### P0.1 — Public repository hygiene

- [ ] Add Apache-2.0 LICENSE and explicit third-party / SaaS credential notice.
- [ ] Write public README: what it does, non-goals, status/roadmap, screenshot storyboard, quickstart, demo mode, limitations.
- [ ] CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md, issue/PR templates, .gitignore, .editorconfig, .env.example.
- [ ] Version policy, changelog/release guidance, do not distribute secrets or misleading Azure "free" claims.
- **Done when:** public clone documents build requirements and contribution path; repo has explicit license.

### P0.2 — pnpm workspace + TypeScript scaffold

- [ ] Pin a supported Node LTS major (recommend 22 for v1) and exact pnpm major/version at scaffold time in packageManager/engines; include reproducible frozen lockfile.
- [ ] Root scripts: dev, build, start, lint, typecheck, test, test:e2e, check, db:generate, db:migrate.
- [ ] Next.js app skeleton, strict TS, ESLint, Prettier, Tailwind/shadcn, core workspace package.
- [ ] Route metadata, responsive shared layout, navigation to S01..S09; avoid compiling or shipping the illustrative static HTML as actual feature code.
- **Done when:** clean checkout installs with pnpm install --frozen-lockfile, builds and serves an accessible landing page.

### P0.3 — DB, auth and safe local storage

- [ ] SQLite + Drizzle migrations, journal mode WAL, foreign keys, busy timeout, correct file path on persistent DATA_DIR.
- [ ] Better Auth with secure user/session tables and server-only AUTH_SECRET. Protect every private route. Add rate limits for login and registration.
- [ ] Minimal tables for demo users/scenarios/sessions/events, keeping later migrations additive.
- [ ] Exclude runtime database, uploads, tokens and keys from Git and image layers.
- [ ] Explicit backup/restore runbook; Docker volume ownership/permissions.
- **Done when:** authenticated user state persists across restart, fresh migration and backup/restore work.

### P0.4 — Agent/speech provider boundaries and DEMO_MODE

- [ ] Define Zod schemas for scenario, interviewer turn, evaluation evidence and speech configuration.
- [ ] Implement **mock provider** returning deterministic fixtures for all screen states; CI runs offline.
- [ ] Define typed LLM gateway interface for Vercel AI SDK and browser SpeechClient interface; real paid API integrations can follow P1/P2.
- [ ] Centralized server-only env validation with actionable configuration errors, optional Azure/LLM keys in demo mode.
- [ ] Versioned correlation IDs and Pino structured logger with redaction; event journal port for future audit.
- **Done when:** demo works entirely offline after dependencies installed, no Azure/LLM secrets needed; no secret leaks into Next client bundle.

### P0.5 — Real UI skeleton backed by mock data

- [ ] Implement navigation/layout from nine-screen UX contract and responsive design tokens.
- [ ] Wire mock state transitions: JD/CV form → scenario review → explicit approve → preflight → simulated meeting → results/history.
- [ ] **Preflight UI**: independent interviewer output locale, dependent voice selector with mock voice catalog, independent candidate STT locale, device-test placeholders clearly labeled demo.
- [ ] Add accessible form labels, disabled/loading/error/empty states; keyboard navigation; responsive 375/768/1440 checks.
- [ ] Do not claim real STT, TTS, voice preview, recording, AI scenario or ZIP export exist in P0.
- **Done when:** E2E test can navigate the UX and assert changing interviewer locale resets/filters voices but never changes candidate STT locale.

### P0.6 — Docker, CI and documentation

- [ ] Multi-stage Docker build with pnpm install --frozen-lockfile and compatible native better-sqlite3 handling; verify Next output tracing includes correct runtime files.
- [ ] One-service compose.yaml with persistent DATA_DIR volume, healthcheck, env_file and clear HTTPS reverse-proxy guidance.
- [ ] CI: lint/typecheck/unit/integration, build, mocked Playwright smoke, Docker build/cold-start test; no paid credentials in PR CI.
- [ ] Docs: local dev, environment variables, self-host upgrade, migrations, backup/restore, Azure/key setup later; diagram and UI contract.
- **Done when:** documented pnpm and Docker commands work from a clean machine, healthcheck reports ready and a restart preserves data.

## 6. Recommended post-scaffold delivery PRs

- **P1** scenario planner: real JD/CV parsing, scenario agent, revision and explicit approval.
- **P2** Azure Speech voice meeting: server-issued token, region voice catalog via SpeechSynthesizer.getVoicesAsync(locale) or supported equivalent, TTS preview, input STT locale, continuous recognition, turn persistence/idempotency, preflight gating, pause/reconnect.
- **P3** adaptive questions/hints: context from CV/JD + previous answers + last spoken question, hint provenance/usage.
- **P4** evaluation and independent workflow audit with evidence ZIP and UI reports.
- **P5** hardening, docs, release and OSS community readiness.

Each feature PR must update matching UI spec, contracts, migrations, logs and tests. The design is **not a claim of completed working features**.

## 7. P0 acceptance checklist (non-negotiable)

- [ ] pnpm install --frozen-lockfile + pnpm dev work from fresh public clone.
- [ ] Docker Compose one-app deployment with persistent DB, no mandatory external DB/service.
- [ ] All screen routes have a coherent responsive shell, and demo mode never requires Azure/LLM credentials.
- [ ] Auth and record ownership enforced server-side; no credentials leaked.
- [ ] Approved scenario requirement and speech settings snapshot exist as typed contracts/mock.
- [ ] Preflight user can independently set AI interview language, compatible voice, and candidate STT language.
- [ ] Changing AI output language preserves candidate STT language; unsupported voice cannot be used.
- [ ] Static prototype and live app mock are explicitly distinguished from paid voice features.
- [ ] No unbounded agent loop; no sensitive JD/CV/transcript fields in operational logs.
- [ ] CI green; deterministic unit and visual/interaction E2E, including denied permissions/empty voice catalog stub.
- [ ] README and CONTRIBUTING make fork/install/deploy/test/release straightforward.

## 8. Risks, mitigations and review gates

| Risk | Mitigation |
|---|---|
| P0 expands into the entire product | Strict stop at reusable foundation + demo UI; phase gates for P1/P2/P4 |
| SQLite file lost on redeploy | Persistent volume, backup/restore instructions, single writer |
| Language/voice catalog mismatch | Real Azure catalog discovery in P2; filter + validate region/locale before Start |
| Browser mic and autoplay restriction | Preflight with user gesture, permission UX and no mock claims |
| Mixed interviewer/input language | Distinct config fields, original transcript preserved, no implicit translation |
| AI provider lock-in | Interfaces and Zod contracts, mock fixtures, no business logic inside provider wrapper |
| Security and sensitive evidence | Better Auth, per-user scopes, consent, log redaction, audio off by default |
| Monorepo complexity | Only web app + small pure core package; no broker/worker/service split |

### Definition of "PR #1 ready to merge"

Maintainer reviews this P0 plan, the SVG and HTML prototype, and confirms UI layout and language/voice UX. **The P0 code belongs in this same PR #1.** Reviewers should only merge when CI and applicable acceptance tests pass.

## 9. Review items

- [ ] Nine-screen navigation and meeting layout approved.
- [ ] Preflight uses the three required independent selectors and preview/device checks.
- [ ] P0 scope (project foundation + DEMO_MODE UI) approved.
- [ ] Accepted that real Azure STT/TTS & dynamic Azure catalog ship in P2, not P0.
- [ ] Confirm P0 code is committed on PR #1 and CI verifies local and Docker startup.
- [ ] License Apache-2.0 and previously approved stack remain unchanged.

References: [technical architecture](../TECHNICAL_ARCHITECTURE.md) | [UX screens](../ui/SCREEN_SPEC.md) | [SVG](../ui/mockups-overview.svg) | [HTML prototype](../ui/prototype.html).

## 10. Clarified demo implementation invariants

- P0 is a real executable app, not the static HTML; demo sessions, scenario revisions/approval, selected voice/languages, typed answers and workflow events persist in SQLite after refresh and restart.
- P0 mock LLM responses are deterministic and clearly marked demo. No paid provider secrets needed to run local or CI.
- Authentication and record ownership occur in route handlers/use cases; never trust user IDs or scenario approval from the browser.
- Simulator Start Meeting requires the latest approved scenario revision and separate informed transcript consent. A request to revise clears previous eligibility.
- All state changes enforce allowed transition map, expected revision and idempotency; recover pending question/TTS delivery status without generating duplicates.
- Provide typed-answer fallback for STT unavailable; provenance of edits preserved on future real STT records.
- Acceptance requires clean pnpm install with committed lockfile, auth, migrations, restart persistence, offline smoke tests and Docker cold start in CI. Unverified checklist rows must remain unchecked and disclosed.
