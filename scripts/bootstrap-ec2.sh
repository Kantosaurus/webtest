#!/usr/bin/env bash
set -euo pipefail

# Bootstrap an Ubuntu 24.04 EC2 instance for webtest.
# Run as root: `sudo bash bootstrap-ec2.sh`

if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (sudo)." >&2
  exit 1
fi

echo "-> Updating apt and installing base packages..."
apt-get update
apt-get install -y ca-certificates curl gnupg ufw

echo "-> Installing Docker Engine + Compose plugin..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable
EOF

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "-> Configuring UFW firewall (22, 80, 443 allowed)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "-> Creating deploy user..."
if ! id -u deploy >/dev/null 2>&1; then
  useradd -m -s /bin/bash deploy
fi
usermod -aG docker deploy
install -o deploy -g deploy -m 0700 -d /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
echo "   Paste your GHA deploy public key into /home/deploy/.ssh/authorized_keys"

echo "-> Creating /opt/webtest workspace..."
install -o deploy -g deploy -m 0755 -d /opt/webtest

echo ""
echo "Bootstrap complete. Next steps:"
echo "  1. Paste your GHA deploy public key into /home/deploy/.ssh/authorized_keys"
echo "  2. Copy docker-compose.yml, docker-compose.prod.yml, Caddyfile, and .env into /opt/webtest/"
echo "  3. chmod 600 /opt/webtest/.env  (fill with real VT_API_KEY, GEMINI_API_KEY, PUBLIC_HOSTNAME)"
echo "  4. Push to main -- GHA deploy workflow will connect as 'deploy' and bring up the stack"
