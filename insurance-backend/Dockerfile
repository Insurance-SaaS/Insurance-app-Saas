# syntax = docker/dockerfile:1

ARG NODE_VERSION=20.19.2

# ── Tools some dependencies need when no prebuilt binary matches ─────────
FROM node:${NODE_VERSION}-slim AS toolchain
WORKDIR /app
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 && \
    rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./

# ── Build: compile TypeScript with the full dependency set ───────────────
FROM toolchain AS build
RUN npm ci
COPY . .
RUN npm run build

# ── Production dependencies only ─────────────────────────────────────────
FROM toolchain AS production-deps
RUN npm ci --omit=dev && npm cache clean --force

# ── Runtime: compiled code and production dependencies, nothing else ─────
FROM node:${NODE_VERSION}-slim

LABEL fly_launch_runtime="NestJS"

ENV NODE_ENV="production"
WORKDIR /app

COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# The image's unprivileged user; the application needs no write access to /app.
USER node

EXPOSE 3000
# Started directly (not through npm) so the process receives SIGTERM and can
# close its database pools and Redis connection before exiting.
CMD [ "node", "dist/main.js" ]
