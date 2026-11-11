#!/usr/bin/env bash
# Build and (re)start WorldLens on the server: the latest code from GitHub, its dependencies,
# the site, then the API and Caddy. First start and every update. Run as "ubuntu":
#
#   bash /srv/worldlens/deploy/oracle/update.sh
set -euo pipefail
cd /srv/worldlens

if sudo grep -qE '^(DATABASE_URL|BETTER_AUTH_SECRET)=$' /etc/worldlens/api.env; then
  echo "Fill in /etc/worldlens/api.env first:  sudoedit /etc/worldlens/api.env" >&2
  exit 1
fi

git pull --ff-only
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm --filter @worldlens/web build

sudo systemctl restart worldlens-api.service
sudo systemctl reload caddy.service 2>/dev/null || sudo systemctl restart caddy.service
sudo systemctl start worldlens-ingest.timer

# Wait for the API, then report its health (no secrets in it).
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:8787/api/health; then
    curl -fsS http://127.0.0.1:8787/api/health | python3 -c 'import json,sys; d=json.load(sys.stdin); print("API up · database:", d["repository"], "· live news:", d["liveNews"])'
    exit 0
  fi
  sleep 2
done
echo "The API did not start. See:  sudo journalctl -u worldlens-api -n 50" >&2
exit 1
