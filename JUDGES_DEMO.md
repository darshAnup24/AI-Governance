# ShieldAI Judge Demo (8 Minutes)

Use this file as your on-stage script.

## 0) Start Everything (before judges arrive)

```bash
docker compose up -d --build
bash scripts/demo.sh
```

Open:
- Dashboard: `http://localhost:3000`
- Proxy docs: `http://localhost:8000/docs`

## 1) 30-Second Opening Pitch

"We built an AI Firewall Proxy that sits between users and LLMs.  
Every prompt and response is inspected in real time for PII, secrets, jailbreaks, and compliance risk.  
The dashboard updates live every 2.5s, so security teams get instant visibility and control."

## 2) Live Flow (what to show)

1. **Live Demo page** (`/live-demo`)
   - Click preset **PII Leak** -> `Inspect Prompt`
   - Show highlighted SSN/card/email spans and action (`REDACT` or `BLOCK`)
2. **Prompt Injection Shield**
   - Click **Prompt Injection** preset -> `Inspect Prompt`
   - Show high risk score and blocked action
3. **Secret Scanner**
   - Click **API Key Leak** preset
   - Show API key detection and policy enforcement
4. **Live Thread Feed**
   - Keep same page visible for 10 seconds
   - Show **Live Audit Feed** updating automatically (2.5s polling)
5. **Incidents page**
   - Show risk/action/category records created from your previous prompts
6. **Policies page**
   - Show dynamic policy engine actions: `BLOCK`, `REDACT`, `WARN`
7. **Shadow AI page**
   - Show unauthorized tool detections, geo detections tab, and trend
8. **Models page (EU AI Act)**
   - Show risk classes: `MINIMAL`, `LIMITED`, `HIGH`, `UNACCEPTABLE`
9. **Compliance + Advisor**
   - Open Compliance for governance posture
   - Open Advisor and ask: "Am I EU AI Act compliant?"
10. **Settings page**
   - Show production controls / configuration screen


## 3) Feature-to-Proof Mapping (say this to judges)

- **AI Firewall Proxy** -> all traffic goes through `POST /v1/chat/completions`
- **PII/Data Leak Protection** -> PII preset highlights + redaction/block
- **Prompt Injection Shield** -> jailbreak preset blocked
- **Secret Scanner** -> API key leak preset detected
- **Dynamic Policy Engine** -> actions switch between allow/warn/redact/block
- **Live Dashboard** -> feed updates every 2.5 seconds
- **Interactive Live Demo** -> sandbox + span highlighting in Live Demo page
- **Shadow AI Detection** -> Shadow AI inventory + unauthorized usage
- **Geo Alerts** -> Shadow AI "Geo Detections" tab
- **EU AI Act Compliance** -> Models risk-level registry + Compliance page
- **Response Inspection** -> governance headers/action shown in proxy workflow
- **Audit Logging** -> incidents + audit events endpoints
- **AI Compliance Advisor** -> governance chat assistant
- **Multi-provider support** -> proxy architecture supports OpenAI/Anthropic/local

## 4) Backup Plan (if internet/LLM key fails)

If upstream model call fails, continue demo with:
- `Live Demo` inspector (local detection path),
- audit feed updates,
- incidents/policy/shadow/compliance pages.

Judges still see core value: **real-time detection + enforcement + visibility**.

## 5) Final Closing Line

"This is not a slideware dashboard. We are showing live interception, live policy enforcement, and live governance evidence in one platform."
