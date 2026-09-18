# Build stage: compile lib, lti and backend (in dependency order)
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first for layer caching
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/lib/package.json ./packages/lib/
COPY packages/lti/package.json ./packages/lti/
COPY packages/backend/package.json ./packages/backend/

RUN yarn install

# Copy sources
COPY packages/lib ./packages/lib
COPY packages/lti ./packages/lti
COPY packages/backend ./packages/backend

# Backend imports @haski/ta-lib and @haski/lti, so build them first
RUN yarn workspace @haski/ta-lib build
RUN yarn workspace @haski/lti build
RUN DATABASE_URL="postgresql://nodegrade:nodegrade@db:5432/nodegrade?schema=public" yarn workspace backend prisma generate
RUN yarn workspace backend build

# Runtime stage
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
RUN corepack enable
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests and install full deps (prisma CLI needed for migrations)
COPY package.json yarn.lock .yarnrc.yml ./
COPY packages/lib/package.json ./packages/lib/
COPY packages/lti/package.json ./packages/lti/
COPY packages/backend/package.json ./packages/backend/

RUN yarn install

# Copy compiled output and prisma schema/migrations/config
COPY --from=build /app/packages/lib/dist ./packages/lib/dist
COPY --from=build /app/packages/lti/dist ./packages/lti/dist
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=build /app/packages/backend/prisma.config.ts ./packages/backend/prisma.config.ts

WORKDIR /app/packages/backend

EXPOSE 5000

# Apply migrations, then start the server (prisma client is already compiled into dist)
CMD ["sh", "-c", "yarn prisma migrate deploy && node dist/src/main.js"]
