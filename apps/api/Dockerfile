# Build stage
FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY pnpm-workspace.yaml pnpm-lock.yaml* package.json tsconfig.base.json .npmrc* ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --no-frozen-lockfile
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @worklink/types build && pnpm --filter @worklink/api build

# Runtime stage
FROM node:20-alpine
WORKDIR /repo
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD curl -fsS http://localhost:4000/api/v1/health || exit 1
WORKDIR /repo/apps/api
CMD ["node", "dist/index.js"]
