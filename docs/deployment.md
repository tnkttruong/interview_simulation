# Self-host / Deploy

## One-service Docker Compose

1. Copy `.env.example` to `.env`, generate a **unique** `BETTER_AUTH_SECRET` with at least 32 random characters.
2. Ensure `APP_URL` matches the public origin including https (or localhost for private use).
3. Execute `docker compose up -d --build`.
4. Check `docker compose ps` and `/api/health`. Restart does not delete data because `interview_data` is a persistent named volume.

**Single-writer SQLite only**. Do not run multiple replicas, use NFS/network-mounted SQLite, or run on ephemeral serverless filesystems. Data is under `/data/interview.db` plus SQLite WAL/SHM. A public deployment must terminate TLS at an upstream reverse proxy.

## Migration and backup

Image startup runs the explicit versioned SQL migrations before starting the web server. Back up database with SQLite's online backup operation (or `VACUUM INTO` using a separately validated destination), including any uploaded files when P1 exists. Do not merely copy an actively-written SQLite db file without the WAL.

Do a restore drill into a separate volume; never migrate an only copy. Do not commit volume files, secrets or candidate transcripts. P0 does not include a web UI for deletion or scheduled retention; operators are responsible for lifecycle and policy.

## P0 rate limits and observability

Better Auth enables sign-in/sign-up throttling. Database transactions cap creation to 12 scenarios per hour (100 total), 30 sessions per hour (300 total) per account. Total caps remain until the operator adds retention/deletion support. List endpoints use `limit=1..50` and `offset=0..10000` and respond with `{items,total,nextOffset}`; scenario summaries omit JD. Demo API responses include `x-request-id` and sanitized Pino request logs (fixed operation, duration, status). Request bodies, transcripts, credentials and full URLs are not logged by this wrapper. Host publicly only behind a trusted TLS reverse proxy with independent ingress limits.
