#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# ShieldAI — Hackathon Network Share Setup
# Rebuilds the dashboard with your LAN IP baked in,
# so any laptop on the same WiFi can access everything.
#
# Usage: bash scripts/share_network.sh
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

BOLD='\033[1m'; CYAN='\033[1;36m'; GREEN='\033[0;32m'
YELLOW='\033[1;33m'; RESET='\033[0m'

# Auto-detect LAN IP (WiFi interface preferred)
LAN_IP=$(ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v "127.0.0.1\|172\.\|docker" | head -1)

if [[ -z "$LAN_IP" ]]; then
  echo "Could not auto-detect LAN IP. Enter it manually:"
  read -rp "Your IP address: " LAN_IP
fi

echo -e "\n${CYAN}${BOLD}ShieldAI Hackathon Network Share${RESET}"
echo -e "Detected LAN IP: ${GREEN}${BOLD}$LAN_IP${RESET}\n"

cat <<EOF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Give these URLs to everyone in the room:

  📊  Dashboard    →  http://${LAN_IP}:3000
  📖  Proxy docs   →  http://${LAN_IP}:8000/docs
  📖  Detection    →  http://${LAN_IP}:8001/docs
  ⚙️   Governance   →  http://${LAN_IP}:4000/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

echo -e "\n${YELLOW}Rebuilding dashboard with LAN IP: $LAN_IP ...${RESET}"

export VITE_API_URL="http://${LAN_IP}:8000"
export VITE_GOVERNANCE_URL="http://${LAN_IP}:4000"

# Stop dashboard, rebuild with LAN IP, restart
docker compose stop dashboard
docker compose build dashboard \
  --build-arg VITE_API_URL="http://${LAN_IP}:8000" \
  --build-arg VITE_GOVERNANCE_URL="http://${LAN_IP}:4000"
docker compose up -d dashboard

echo ""
echo -e "${GREEN}${BOLD}✓ Dashboard rebuilt and started with LAN IP baked in.${RESET}"
echo ""
echo -e "Wait ~10s then open: ${BOLD}http://${LAN_IP}:3000${RESET}"
echo ""

# Print QR-code style share card
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Share with judges / teammates:"
echo ""
echo "  http://${LAN_IP}:3000"
echo ""
echo "  Login:  demo@shieldai.dev"
echo "  Pass:   Demo1234!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
