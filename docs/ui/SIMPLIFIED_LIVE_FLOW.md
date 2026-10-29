# Simplified AI interview flow

The signed-in default route (`/`) redirects to `/live`. The legacy deterministic offline demo remains available at `/demo` for QA and development.

## Candidate journey

1. On the **single setup page**, paste a job description and upload/paste a CV. Role and interview focus are optional. PDF extraction runs in the browser; other supported documents use the existing CV parser.
2. Select **Generate AI interview scenario**. The generated plan, question count, optional question/answer preview and optional revision control appear **inline on the same page**. Editing JD/CV/role/focus invalidates that preview until the inputs are restored or a new scenario is generated.
3. Check explicit transcript-storage consent and select **Start AI meeting**. The UI approves the latest generated revision through the existing authenticated API, creates a live session with the current account's default language/voice preferences, and generates the first question. There is no additional approval or preflight screen.
4. The meeting displays the AI interviewer, current question, typed-answer box and **Commit answer & next question** action. Optional private hint, suggested answer, speech controls, pause/resume and transcript remain accessible without becoming separate screens.
5. Finish to review the transcript or start another meeting. Previous live sessions and privacy/data deletion are collapsible sections on the setup page.

## Voice and safety

- **Automatic** input is the default: Azure voice is offered when configured and the selected voice is supported; otherwise the app enters typed-answer mode. **Typed** and **Azure voice** remain selectable in advanced meeting preferences.
- Mic permission is requested on use, not as a mandatory pre-start checklist; a failed microphone operation does not erase text answers.
- Transcript consent remains explicitly unchecked by default. CV/JD are saved upon script generation, with a disclosure beside the generation button.
- Scenario approval, ownership checks, revision validation, question sequence, idempotency keys, server AI budgets and evidence records remain server-enforced; only the presentation flow changed.
- Existing API routes and the legacy offline demo remain available. AI provider settings are under `/settings`.
- Planned questions (including generated model answers) guide live adaptive questions; the interviewer may ask follow-ups rather than reading them verbatim.

## Regression coverage

- `live-flow.spec.ts`: generate → optional preview/revision → implicit approval → meeting → reveal/hide suggested answer → hint → answer → pause/resume → finish → delete.
- `live.spec.ts`: confirms the absence of the previous five-step navigation and presence of the JD/CV workspace.
- `ai-settings.spec.ts`: verifies saved locale defaults via optional meeting preferences.
- Demo API and page regression tests run at `/demo` without changing P0 semantics.
