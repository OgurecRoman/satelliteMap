#!/usr/bin/env bash
set -euo pipefail

cd /opt/satelliteMap

echo "[1/4] Fetch latest code..."
git fetch origin

echo "[2/4] Reset to origin/main..."
git reset --hard origin/main

echo "[3/4] Rebuild and start containers..."
docker compose up -d --build

echo "[4/4] Remove dangling images..."
docker image prune -f

echo "Deploy finished."