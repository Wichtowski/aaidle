PNPM ?= pnpm
COMPOSE ?= docker compose -f backend/compose.yml
SCRIPTS := validate-emoji-game-data validate-model-data validate-workflow-action-pins

.DEFAULT_GOAL := help

.PHONY: help install dev build preview lint typecheck test test-watch check format \
	backend-up backend-down backend-logs backend-ps backend-build backend-test \
	up down logs ps scripts $(SCRIPTS)

help:
	@echo "AIdle development commands"
	@echo ""
	@echo "  make install          Install frontend dependencies"
	@echo "  make dev              Start the Vite frontend"
	@echo "  make build            Build the static frontend"
	@echo "  make preview          Preview the static frontend build"
	@echo "  make lint             Run frontend linting"
	@echo "  make typecheck        Run TypeScript checks"
	@echo "  make test             Run frontend tests"
	@echo "  make test-watch       Watch frontend tests"
	@echo "  make check            Run the frontend quality suite"
	@echo "  make format           Format the repository"
	@echo ""
	@echo "  make up               Build and start the Rust API on localhost:8080"
	@echo "  make down             Stop the Rust API"
	@echo "  make logs             Follow Rust API logs"
	@echo "  make ps               Show Rust API status"
	@echo "  make backend-build    Build the Rust API"
	@echo "  make backend-test     Run Rust API tests"
	@echo ""
	@echo "  make scripts          List available repository scripts"
	@echo "  make validate-workflow-action-pins"
	@echo "                        Run scripts/validate-workflow-action-pins.mjs"

install:
	$(PNPM) install

dev:
	$(PNPM) dev

build:
	$(PNPM) build

preview:
	$(PNPM) preview

lint:
	$(PNPM) lint

typecheck:
	$(PNPM) typecheck

test:
	$(PNPM) test

test-watch:
	$(PNPM) test:watch

check:
	$(PNPM) check

format:
	$(PNPM) format

up: backend-up

backend-up:
	@test -f backend/.env || (echo "Copy backend/.env.example to backend/.env and set its secrets"; exit 1)
	$(COMPOSE) up -d --build

down: backend-down

backend-down:
	$(COMPOSE) down

logs: backend-logs

backend-logs:
	$(COMPOSE) logs -f api

ps: backend-ps

backend-ps:
	$(COMPOSE) ps

backend-build:
	cargo build --manifest-path backend/Cargo.toml

backend-test:
	cargo test --manifest-path backend/Cargo.toml

scripts:
	@printf '%s\n' $(SCRIPTS)

$(SCRIPTS):
	node "scripts/$@.mjs"
