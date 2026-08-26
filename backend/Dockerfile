FROM rust:1.94-bookworm AS builder

WORKDIR /build

COPY backend/Cargo.toml backend/Cargo.lock ./backend/
COPY backend/src ./backend/src
COPY backend/migrations ./backend/migrations
COPY data/classic.seed.json ./data/classic.seed.json
COPY data/emoji.seed.json ./data/emoji.seed.json
COPY data/timeline.seed.json ./data/timeline.seed.json

WORKDIR /build/backend

RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/backend/target \
    cargo build --locked --release --bin aidle-api --bin seed --bin fixture_admin \
    && mkdir -p /out \
    && cp /build/backend/target/release/aidle-api /out/aidle-api \
    && cp /build/backend/target/release/seed /out/aidle-seed \
    && cp /build/backend/target/release/fixture_admin /out/aidle-fixture-admin


FROM debian:bookworm-slim AS runtime

RUN useradd --create-home --system --uid 10001 --user-group aaidle \
    && mkdir /data \
    && chown aaidle:aaidle /data \
    && apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /out/aidle-api /usr/local/bin/aidle-api
COPY --from=builder /out/aidle-seed /usr/local/bin/aidle-seed
COPY --from=builder /out/aidle-fixture-admin /usr/local/bin/aidle-fixture-admin

USER aaidle

VOLUME ["/data"]

EXPOSE 8080

ENV AIDLE_BIND_ADDR=0.0.0.0:8080
ENV DATABASE_URL=sqlite:///data/aidle.db

CMD ["aidle-api"]
