# Build stage
FROM public.ecr.aws/docker/library/node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

# All dependencies (devDependencies are needed to compile TypeScript)
RUN npm ci && npm cache clean --force

COPY . .

RUN npm run build

# Production stage
FROM public.ecr.aws/docker/library/node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./

# Production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# SQL migrations are read at runtime from dist/migrations
COPY --from=builder /app/src/migrations ./dist/migrations

# Runtime folders, owned by the unprivileged user
RUN mkdir -p uploads logs && chown -R node:node /app

USER node

EXPOSE 5000

# Liveness only (no database call): the platform restarts the container if this fails
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-5000}/health" > /dev/null || exit 1

CMD ["node", "dist/server.js"]
