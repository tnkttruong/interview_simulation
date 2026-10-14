FROM node:22-bookworm-slim AS builder
WORKDIR /source
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/interview-core/package.json packages/interview-core/package.json
RUN pnpm install --frozen-lockfile
COPY . .
# Required config is validated at runtime, not during static compilation.
# This placeholder exists only in the builder stage and is NOT copied into the runner image.
ENV DEMO_MODE=true
ENV BETTER_AUTH_SECRET=build-only-placeholder-secret-minimum-32-character-length
RUN pnpm build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production DEMO_MODE=true APP_ROOT_DIR=/app DATABASE_URL=/data/interview.db PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=builder --chown=node:node /source/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /source/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /source/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /source/apps/web/scripts ./apps/web/scripts
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh","-c","node apps/web/scripts/migrate.mjs && exec node apps/web/server.js"]
