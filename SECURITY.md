# Security Policy

Do not disclose security flaws in public issues. Contact the repository owner privately through GitHub's private vulnerability reporting feature when enabled, or contact the maintainer through their published contact channel.

Keep `.env`, SQLite files and speech/model credentials secret. Demo mode accepts transcript text only; it does not activate paid speech endpoints. Self-hosters must use HTTPS/TLS, unique Better Auth secrets, single-instance SQLite deployment, volume backups and restricted filesystem permissions.

All user-scoped endpoints require authentication and server-side ownership checks. Changes to authorization, parsing, audit or speech-token issuance require negative security tests.
