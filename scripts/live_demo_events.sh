#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# Airlock — Live Demo Event Generator
# Run this during your presentation to trigger real-time events.
# ═══════════════════════════════════════════════════════════════

BASE_PROXY="http://localhost:8000"
BASE_GOV="http://localhost:4000"
PROXY_TOKEN="dev-token-hackathon-demo"

CYAN='\033[1;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'

clear
echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}║             Airlock Live Event Generator                  ║${RESET}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""

while true; do
  echo -e "${BOLD}Select an event to fire:${RESET}"
  echo "  1) 🔴 Trigger a BLOCKED prompt (API Key Leak)"
  echo "  2) 🟡 Trigger a REDACTED prompt (SSN / PII)"
  echo "  3) 🟢 Trigger a CLEAN prompt (Normal Chat)"
  echo "  4) 👻 Ingest a Shadow AI event (Unauthorized tool usage)"
  echo "  5) ❌ Trigger a Failed Login (Bad Password)"
  echo "  0) Exit"
  echo ""
  read -rp "Enter choice: " choice

  case $choice in
    1)
      echo -e "\n${YELLOW}Firing API Key leak prompt to proxy...${RESET}"
      RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_PROXY/v1/chat/completions" \
        -H "Authorization: Bearer $PROXY_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"model":"gpt-4","messages":[{"role":"user","content":"Can you debug this? Here is my key: sk-abc123def456ghi789jklmnopqrstuv"}]}')
      echo -e "${GREEN}✓ Sent! (Proxy returned HTTP $RESP). Look at the Threat Feed!${RESET}\n"
      ;;
    2)
      echo -e "\n${YELLOW}Firing PII prompt to proxy...${RESET}"
      RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_PROXY/v1/chat/completions" \
        -H "Authorization: Bearer $PROXY_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"model":"gpt-4","messages":[{"role":"user","content":"My SSN is 123-45-6789. Please use it for the application."}]}')
      echo -e "${GREEN}✓ Sent! (Proxy returned HTTP $RESP). Look at the Threat Feed!${RESET}\n"
      ;;
    3)
      echo -e "\n${YELLOW}Firing Clean prompt to proxy...${RESET}"
      RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_PROXY/v1/chat/completions" \
        -H "Authorization: Bearer $PROXY_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"model":"gpt-4","messages":[{"role":"user","content":"What are the main benefits of AI Governance?"}]}')
      echo -e "${GREEN}✓ Sent! (Proxy returned HTTP $RESP). Look at the Threat Feed!${RESET}\n"
      ;;
    4)
      echo -e "\n${YELLOW}Ingesting Shadow AI alert...${RESET}"
      RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_PROXY/api/v1/shadow-ai/events" \
        -H "Content-Type: application/json" \
        -d '{"user_id":"employee-42","tool_name":"DeepSeek-Unauthorized","domain":"chat.deepseek.com","category":"GenAI","is_authorized":false}')
      echo -e "${GREEN}✓ Sent! (Proxy returned HTTP $RESP). Check the Shadow AI Dashboard!${RESET}\n"
      ;;
    5)
      echo -e "\n${YELLOW}Attempting login with wrong password...${RESET}"
      RESP=$(curl -s -X POST "$BASE_GOV/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"demo@airlock.dev","password":"WrongPassword!"}')
      echo -e "${RED}✗ Login failed! Response: $RESP${RESET}\n"
      ;;
    0)
      echo "Exiting..."
      exit 0
      ;;
    *)
      echo -e "${RED}Invalid choice.${RESET}\n"
      ;;
  esac
done
