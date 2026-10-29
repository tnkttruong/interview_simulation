# Provider diagnostics (Codex / Agy / Azure)

After signing in, open **/settings/test** (also linked from **/settings**). This page runs real tests independently of an interview.

## Operator setup

Run on **localhost or a trusted self-hosted instance**. Provider tests are **disabled by default** because the endpoints can spend money or use the web-server OS user's authenticated CLI. Configure these environment variables and restart the server:

```dotenv
ENABLE_PROVIDER_TESTS=true
ENABLE_LOCAL_AI_CLI=true
# Optional when testing Azure Speech:
AZURE_SPEECH_REGION=eastus
AZURE_SPEECH_KEY=...
```

Install and authenticate Codex and/or Agy as the **same OS account that runs Next.js**; `codex --version` or `agy --version` alone does not validate authentication. Choose installed provider and supported model in the diagnostic page, then click **Run test**. It sends only a fixed JSON challenge (no JD, CV, or user-entered prompt). A valid response proves the installed CLI can make a model call and return structured output.

Azure tests include credential/token exchange, synthesized voice preview, local speaker tone, microphone permission and a real one-shot Azure STT recognition. Azure STT needs HTTPS or localhost with browser microphone access. Azure receives speech audio only during STT; the recognized phrase is shown in local UI state, not stored by this application. Azure token is short-lived and kept only in memory. The subscription key stays server-side.

**Safety:** This page is gated by ENABLE_PROVIDER_TESTS but is available to *any authenticated account* when enabled. Do not enable it for untrusted public signups. Local CLI processes share server OS credentials, are not tenant-isolated, and can incur provider charges. The API uses fixed prompts, validated model IDs, server-side budgets, per-user Azure token throttling and no-secret status responses. Turn the flag off again after verifying providers.

Automated E2E tests cover authorization, status and missing-provider responses without external credentials. They do not prove production Codex/Agy logins or Azure STT/TTS browser behavior. Perform the manual checks above on the target host.
