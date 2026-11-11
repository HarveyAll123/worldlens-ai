#!/usr/bin/env bash
# One-time setup of an Oracle Cloud Always Free server (Ubuntu 24.04, Arm) for WorldLens.
# Run as the default "ubuntu" user, with the repository already cloned to /srv/worldlens:
#
#   bash /srv/worldlens/deploy/oracle/setup.sh your-name.duckdns.org
#
# It installs: security updates (and automatic ones), a 2 GB swap file, firewall openings for
# web traffic, Node.js 24 + pnpm, Caddy (HTTPS), the "worldlens" service user, the root-only
# settings file /etc/worldlens/api.env (with fresh secrets), and the services. Safe to re-run.
set -euo pipefail

DOMAIN="${1:-}"
APP=/srv/worldlens
if [ -z "$DOMAIN" ]; then
  echo "usage: bash $APP/deploy/oracle/setup.sh <your-domain>" >&2
  exit 1
fi
if [ ! -d "$APP/.git" ]; then
  echo "Clone the repository to $APP first (DEPLOYMENT.md, Oracle step 5)." >&2
  exit 1
fi

step() { printf '\n== %s\n' "$1"; }

step "System updates, and automatic security updates from now on"
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get -y upgrade
sudo DEBIAN_FRONTEND=noninteractive apt-get -y install \
  curl git ca-certificates gnupg openssl python3 unattended-upgrades \
  iptables-persistent netfilter-persistent \
  debian-keyring debian-archive-keyring apt-transport-https
echo 'unattended-upgrades unattended-upgrades/enable_auto_updates boolean true' | sudo debconf-set-selections
sudo DEBIAN_FRONTEND=noninteractive dpkg-reconfigure -f noninteractive unattended-upgrades

step "Swap (2 GB): room for building the site"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

step "Firewall: let web traffic in (Oracle's Ubuntu image rejects everything but SSH)"
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    line=$(sudo iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')
    sudo iptables -I INPUT "${line:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
sudo netfilter-persistent save

step "Node.js 24 and pnpm"
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo corepack enable
corepack prepare "$(node -p "require('$APP/package.json').packageManager")" --activate

step "Caddy (the HTTPS web server)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
    sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi

step "Service user \"worldlens\" (runs the API; cannot log in or change the code)"
id worldlens >/dev/null 2>&1 ||
  sudo useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin worldlens

step "Settings file /etc/worldlens/api.env (root only, mode 600)"
sudo install -d -m 700 -o root -g root /etc/worldlens
if [ ! -f /etc/worldlens/api.env ]; then
  sudo install -m 600 -o root -g root "$APP/deploy/oracle/api.env.example" /etc/worldlens/api.env
  # The address, and two secrets made here for this server only (never shown or logged).
  sudo DOMAIN="$DOMAIN" python3 - <<'PY'
import os, re, secrets, base64
path = '/etc/worldlens/api.env'
text = open(path).read().replace('YOUR-DOMAIN', os.environ['DOMAIN'])
text = re.sub(r'^BETTER_AUTH_SECRET=.*$', 'BETTER_AUTH_SECRET=' + base64.b64encode(secrets.token_bytes(32)).decode(), text, flags=re.M)
text = re.sub(r'^INGEST_TOKEN=.*$', 'INGEST_TOKEN=' + secrets.token_hex(32), text, flags=re.M)
open(path, 'w').write(text)
PY
  echo "Created. Add your keys with:  sudoedit /etc/worldlens/api.env"
else
  echo "Kept the existing file (secrets unchanged)."
fi

step "Website settings apps/web/.env.production.local (yours only, mode 600)"
WEB_ENV="$APP/apps/web/.env.production.local"
if [ ! -f "$WEB_ENV" ]; then
  install -m 600 /dev/null "$WEB_ENV"
  printf 'VITE_API_BASE_URL=\nVITE_MAPTILER_API_KEY=\n' >"$WEB_ENV"
  echo "Created. Add your MapTiler key with:  nano $WEB_ENV"
fi

step "Services: the API, the 15-minute news timer, Caddy"
sudo install -m 644 "$APP/deploy/oracle/worldlens-api.service" /etc/systemd/system/
sudo install -m 644 "$APP/deploy/oracle/worldlens-ingest.service" /etc/systemd/system/
sudo install -m 644 "$APP/deploy/oracle/worldlens-ingest.timer" /etc/systemd/system/
sed "s/YOUR-DOMAIN/$DOMAIN/g" "$APP/deploy/oracle/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl enable worldlens-api.service worldlens-ingest.timer caddy.service

cat <<DONE

Setup done. Next:
  1. sudoedit /etc/worldlens/api.env          (DATABASE_URL, GEMINI_API_KEY, Google, Brevo, PayPal)
  2. nano $WEB_ENV   (VITE_MAPTILER_API_KEY)
  3. bash $APP/deploy/oracle/update.sh         (builds the site and starts everything)
DONE
