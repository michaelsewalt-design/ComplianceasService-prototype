# Compliance as a Service Platform

> **PROTIVITI Compliance advisory services** — een geïntegreerd webplatform voor compliance training, incident management, adverse media screening en vendor risk assessments.

## Overview

Dit platform bundelt vier operationele compliance-tools plus een sales/lead-generation frontend onder één portal. Elke sub-tool is een op zichzelf staand product met eigen authenticatie, eigen AI-integratie en eigen use-case, maar deelt een consistent auth-patroon, storage-model en Vercel deployment stack.

**Live at:** `https://complianceas-service-prototype.vercel.app`
**Hosting:** Vercel (Hobby tier — 12 serverless functions)
**Storage:** Upstash Redis (Frankfurt region, GDPR-conform)
**AI:** Anthropic Claude Sonnet 4.6 (per-tool API keys)

## Modules

| Module | Status | Path | Purpose |
|---|---|---|---|
| 🎓 Training | Live | `/training` | Interactieve compliance training (AML, MAR, COI) met AI coaches en assessment |
| 📝 Incident & Request | Prototype | `/incident-request` | Compliance incident portal met AI review + audit trail + regulatory reporting |
| 🔎 Adverse Media Check | Prototype | `/screening` | KYC/AML screening met Dilisense database + open-source research |
| 📊 Vendor Assessment | Prototype | `/vendor-assessment` | Third-party vendor risk assessment (DORA/EBA Outsourcing) |

Roadmap modules (in Portal zichtbaar als "Coming soon"): Policy Library · Gifts & Hospitality Register · Whistleblower/Speak-Up · Compliance Dashboard.

## Quick start

### For users
Navigate to the module you need via the portal landing page. Each module requires its own login (isolated auth per tool). For access requests, use the "Contact PROTIVITI Compliance advisory services" button on the landing page.

### For developers
```bash
git clone <repo>
npm install
vercel link
vercel env pull .env.development.local
npm run dev   # runs vercel dev locally