# Typed interview harness (v3)

## Script contract

Each stage includes typed `items` as well as legacy `questions` and `suggestedAnswers` arrays for existing consumers. Items include:

- `type`: `standalone` (one answer and advance) or `interactive` (one scenario opener and optional follow-ups)
- `prompt`: scripted opening question; `goal` and `completionCriteria` explain what to assess
- `maxFollowUps`: strictly 0 for standalone, 1–3 for interactive; `suggestedAnswer` is a practice reference, not candidate evidence

Generated/revised scripts require both types. Old scripts without `items` remain valid; new interviews using those scripts follow the legacy adaptive mode. Existing in-progress interviews keep their prior question-generation mode.

## Deterministic execution

`live_questions` persists `item_index`, `question_type`, `follow_up_depth`, `follow_up_limit` and scenario metadata, alongside the immutable question and model answer. Each session can reconstruct its cursor after restart from the latest answered question; there is no client-authored cursor.

- On first question or after a standalone: emit the **exact next scripted question**, no LLM call.
- After an interactive answer while below `maxFollowUps`: AI selects `follow_up` or `next_question` using the scenario goal, completion criteria and last 5 Q&A turns. The model cannot choose another plan item or change max depth.
- On `follow_up`: ask the generated question in the **same** scenario and increment the depth.
- On `next_question`, or when depth cap is reached: advance to the next scripted item.
- After the last item: transition session to `COMPLETED` through the existing state machine. The global 15-answer limit is still enforced.
- Existing idempotency, ownership, stale question checks and per-account AI budget remain in effect. We never generate answer text on behalf of the candidate.

## Safety / compatibility

The client cannot forge item indexes or skip scenarios; all planning state is server-controlled. Legacy rows have `item_index=-1` and remain on the prior adaptive model. New columns are additive in migration 0007. Concurrency and no-double-charge constraints apply only when an LLM decision is required; scripted questions are persisted transactionally without model cost.

### Known limitation

This is an interview simulation harness, not a validated grading engine. It does not infer a certified skills score. The decision to move to the next item is an AI judgment constrained by server-side limits, not proof that the competency has been mastered.

## Review hardening

- Approved revisions are immutable via live scenario update and plan regeneration APIs. To make changes, create a fresh AI revision. The server rechecks approval under the write transaction to close approval/planning races. Active sessions have their own plan JSON snapshot.
- New AI-generated plans are validated against the 15-answer worst-case budget (scripted questions plus all allowed follow-ups). Existing plans remain readable. Live sessions complete atomically when the fifteenth answer is committed.
- A deterministic, conservative lexical guard rejects clearly unrelated or repeated AI follow-ups and advances the scripted cursor. It is not a substitute for semantic evaluation of interview quality.
