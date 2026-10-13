# Contributing

Welcome! Open an issue describing the expected behavior before major refactors. Small focused PRs are preferred; run `pnpm check` and any relevant Playwright tests first.

Use conventional commits (`feat:`, `fix:`, `docs:`, `test:`). Keep domain logic in `packages/interview-core`, request security/ownership in server use cases, and provider-specific code behind adapters. Tests must run in demo mode without cloud credentials.

Update `docs/TECHNICAL_ARCHITECTURE.md` and UI contracts for state, data, speech or auth changes. Never commit API keys, CV contents, raw audio, transcripts or production databases.
