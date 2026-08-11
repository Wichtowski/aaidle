FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
RUN corepack enable
RUN apt-get update && apt-get install --no-install-recommends -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build

ARG AAIDLE_VERSION=dev
ENV AAIDLE_VERSION=$AAIDLE_VERSION

COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ARG AAIDLE_VERSION=dev
ENV AAIDLE_VERSION=$AAIDLE_VERSION

RUN corepack enable && useradd --create-home --system --uid 1001 --user-group aaidle && mkdir /data && chown aaidle:aaidle /data

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY --from=build /app/data ./data
COPY --from=build /app/database ./database
COPY --from=build /app/scripts ./scripts

USER aaidle
VOLUME ["/data"]
EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/seed.mjs && exec node node_modules/vinext/dist/cli.js start"]
