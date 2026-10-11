#!/bin/sh
# Starts (or updates) the Mawatheeq office server. Run from this folder: sh start.sh
set -eu
cd "$(dirname "$0")"
[ -f .env ] || docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:22-alpine node tools/setup-env.mjs
mkdir -p data/files data/bridge backups
profiles=""
grep -q '^BRIDGE_KEY=..*' .env && profiles="--profile bridge"
# shellcheck disable=SC2086
docker compose $profiles up -d --build --remove-orphans
port=$(grep '^HTTP_PORT=' .env | cut -d= -f2); port=${port:-8080}
echo ""
echo "Mawatheeq is running. Open http://$(hostname -I 2>/dev/null | awk '{print $1}'):$port from any computer in the office."
echo "First time only: create the owner account with:  docker compose run --rm admin"
