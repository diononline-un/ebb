# syntax=docker/dockerfile:1

# Stage 1: dependency install plus the web bundle. Nothing from here ships except dist/web.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime. Production dependencies only, non-root, migrations before the server.
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist/web ./dist/web
COPY src ./src
COPY migrations ./migrations
# The reminder job reads its push texts and the release flags (locales/.meta.json) at runtime.
COPY locales ./locales
COPY scripts/migrate.ts ./scripts/migrate.ts
COPY docker/entrypoint.sh ./docker/entrypoint.sh
# Host umask differs between machines; the node user must be able to read everything it runs.
RUN chmod -R a+rX /app
EXPOSE 2040
USER node
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
