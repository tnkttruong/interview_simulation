# Provider interfaces (future P1–P3)

P0 ships deterministic fixtures and typed core contracts. The live LLM adapter based on Vercel AI SDK, Azure Speech JS browser token exchange, and prompt-scoped agents are intentionally **not implemented**.

When adding real providers, keep credentials on the server, use versioned Zod outputs and persisted metadata, and implement bounded retry/time/usage limits. Speech settings (interviewer spoken locale, compatible voice, candidate STT locale) are separate; original recognized text and candidate edits have separate provenance. No real provider may mutate the approved scenario or session state machine directly.

## Typed provider ports

`packages/interview-core/src/ports.ts` defines `LlmGateway` and `SpeechClient` interfaces plus Zod contracts for scenario plans, interviewer turns and assessment evidence. P0 only defines these contracts, not live AI/STT/TTS adapters. The orchestrator retains policy/state authority in future phases.
