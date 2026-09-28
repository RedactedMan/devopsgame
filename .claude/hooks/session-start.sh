#!/bin/bash
# Claude Code on the web: install dependencies so pnpm test, pnpm typecheck and
# pnpm test:e2e work in a fresh cloud session. A laptop does nothing here.
# pnpm test:e2e then finds the environment's Chromium by itself
# (playwright.config.ts), so no browser is downloaded.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
# Idempotent, and reuses pnpm's cached store. --frozen-lockfile so that a
# lockfile out of step with package.json fails loudly instead of being rewritten.
pnpm install --frozen-lockfile
