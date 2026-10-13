# Development

The contributor experience is intentionally a pnpm workspace with one Next.js service and one pure domain package.

## Quickstart

From repository root: `corepack enable && pnpm install`, copy `.env.example` to `.env`, generate a 32+ character random `BETTER_AUTH_SECRET`, then `pnpm db:migrate && pnpm dev`. Real P0 demo mode requires no AI/Azure keys.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` and `pnpm test:e2e` (install Playwright Chromium first). `pnpm check` runs static/unit/build tests.

P0 state and mock questions live in `packages/interview-core`; REST routes only validate session/authorization and call use cases in `apps/web/src/server/demo.ts`. UI controls in `apps/web/src/features/Workspace.tsx` must not mutate trusted state directly. Every new write requires an owner check, state/version policy, and idempotency when retriable.

Migrations live under `apps/web/scripts/migrations`; never silently auto-sync schemas in production. Add an explicit next-version SQL file for changes.

P0 now defines provider contracts (no implementations) at `packages/interview-core/src/ports.ts`. Answer submission requires `expectedTurnSequence` to reject stale-tab assignments while preserving idempotent retries.
