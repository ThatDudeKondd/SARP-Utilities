#!/usr/bin/env bash
set -euo pipefail

LOCKFILE="/tmp/sarp-deploy.lock"
exec 200>"$LOCKFILE"
if ! flock -n 200; then
  echo "Another deploy is already running, skipping."
  exit 0
fi

ROOT_DIR="/opt/sarp-project"
BOT_DIR="$ROOT_DIR/SARP-Utilities"
DJSKO_DIR="$ROOT_DIR/djsko"
BRANCH="main"

CHANGED=0

for REPO_DIR in "$BOT_DIR" "$DJSKO_DIR"; do
  cd "$REPO_DIR"
  git fetch origin "$BRANCH"
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/"$BRANCH")
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "Changes found in $(basename "$REPO_DIR") ($LOCAL -> $REMOTE), pulling..."
    git pull origin "$BRANCH"
    CHANGED=1
  fi
done

if [ "$CHANGED" -eq 0 ]; then
  echo "No changes in either repo, nothing to deploy."
  exit 0
fi

cd "$ROOT_DIR"
npm install

# db:update (format -> db push -> generate) runs from within the bot's
# workspace so it picks up SARP-Utilities/package.json's script definitions.
# Prisma client must exist before the build compiles
# src/generated/prisma -> dist/generated/prisma, which db:update's final
# generate step handles.
npm run db:update --workspace=SARP-Utilities

npm run build

systemctl --user restart sarp-utilities.service

echo "Deploy complete."