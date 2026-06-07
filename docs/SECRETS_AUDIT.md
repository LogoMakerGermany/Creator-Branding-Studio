# Secrets Audit & Railway Deployment

Stand: Security-Hardening Branch `cursor/railway-secrets-hardening`

---

## 1. Gefundene Sicherheitsprobleme

| Schwere | Problem | Status |
|---------|---------|--------|
| **KRITISCH** | Echte API-Keys in `.env.example` (im Git-Commit `f873055`) | ✅ Bereinigt – Platzhalter only |
| **KRITISCH** | `STRIPE_SECRET_KEY` enthielt fälschlich `pk_test_...` (Publishable Key) | ✅ Entfernt – Keys rotieren! |
| **HOCH** | JWT-Fallback `dev-secret-change-me` in `config.ts` | ✅ Entfernt |
| **HOCH** | `.env` nur teilweise in `.gitignore` | ✅ `.env.*` blockiert |
| **MITTEL** | Kein Startup-Env-Check | ✅ `validateEnvOnStartup()` |
| **MITTEL** | Vite-Proxy zeigte auf Port 3000 statt 3001 | ✅ Behoben |
| **INFO** | Secrets noch in Git-Historie (`f873055`) | ⚠️ Keys rotieren, History optional bereinigen |

---

## 2. Gefundene Schlüssel (historisch in `.env.example`)

Diese Werte waren **öffentlich im Repository** und müssen **rotiert** werden:

| Variable | Präfix/Typ | Aktion |
|----------|------------|--------|
| `OPENAI_API_KEY` | `sk-proj-...` | OpenAI Dashboard → Key widerrufen + neu |
| `REPLICATE_API_TOKEN` | `r8_...` | Replicate → Token widerrufen + neu |
| `RUNWAY_API_KEY` | `key_...` | Runway → Key widerrufen + neu |
| `JWT_SECRET` | Klartext | Neuen 32+ Zeichen Secret generieren |
| `STRIPE_SECRET_KEY` | `pk_test_...` (falsch!) | Stripe → korrekten `sk_test_`/`sk_live_` Key setzen |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe Webhook → Endpoint neu anlegen |

---

## 3. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `.env.example` | Nur leere Platzhalter |
| `apps/web/.env.example` | Nur `VITE_*` (öffentlich) |
| `.gitignore` | `.env`, `.env.*`, `apps/web/.env.local` |
| `apps/api/src/config.ts` | Keine Fallback-Secrets, Railway-only in Production |
| `apps/api/src/validateEnv.ts` | Startup-Warnungen + Production-Validierung |
| `apps/api/src/index.ts` | Static Web-Serving in Production |
| `apps/api/src/middleware/security.ts` | `RATE_LIMIT_ENABLED` |
| `apps/api/src/auth/mockAuth.ts` | `requireJwtSecret()` |
| `apps/web/vite.config.ts` | Proxy → Port 3001 |
| `scripts/check-secrets.mjs` | CI Secret-Scanner |
| `railway.json` | Railway Deploy-Konfiguration |
| `.github/workflows/ci.yml` | Secret-Scan in CI |

---

## 4. GitHub-Sicherheitsstatus

| Check | Status |
|-------|--------|
| `.env` in `.gitignore` | ✅ |
| `.env.example` ohne echte Werte | ✅ (aktueller Stand) |
| Frontend ohne Secret Keys | ✅ |
| CI Secret-Scan (`npm run check:secrets`) | ✅ |
| Git-Historie sauber | ❌ Commit `f873055` enthält noch Keys |

**Empfehlung:** Alle Keys rotieren. Optional: `git filter-repo` oder BFG Repo-Cleaner für History.

---

## 5. Railway-Konfiguration

### Backend Service (Environment Variables)

```env
NODE_ENV=production
PORT=3001
AUTH_PROVIDER=firebase
DB_PROVIDER=local
JWT_SECRET=<32+ Zeichen Zufall>
CORS_ORIGIN=https://deine-domain.com

OPENAI_API_KEY=sk-...
REPLICATE_API_TOKEN=r8_...
RUNWAY_API_KEY=key_...

STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=<PEM, \n escaped>

PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

UPLOAD_PROVIDER=local
RATE_LIMIT_ENABLED=true
ADMIN_EMAIL=admin@deine-domain.com
ALLOW_MOCK_AUTH=false
ALLOW_MOCK_PAYMENTS=false
```

### Stripe Webhook

- URL: `https://<railway-domain>/api/payments/stripe/webhook`
- Events: `checkout.session.completed`
- Secret → `STRIPE_WEBHOOK_SECRET`

### Frontend (separater Service oder Build-Args)

Nur öffentliche Werte:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Docker / Single Service

Das Dockerfile baut Web + API. In Production serviert die API auch `apps/web/dist`.

Healthcheck: `GET /api/health`

---

## 6. Architektur (Secrets)

```
Browser
  ↓ (nur öffentliche VITE_* Keys)
Frontend (React)
  ↓ HTTPS + Cookies
Backend API (Railway env vars)
  ↓
OpenAI / Replicate / Runway / Stripe / Firebase Admin
```

**Frontend enthält niemals:** `sk-`, `r8_`, `whsec_`, JWT_SECRET, Firebase Private Key.

---

## 7. Release-Einschätzung

| Stufe | Bewertung | Begründung |
|-------|-----------|------------|
| **Beta Release** | ✅ Bereit | Nach Key-Rotation + Railway-Deploy |
| **Öffentlicher Release** | ⚠️ Fast | Firestore DB + Firebase Frontend-Auth fehlen noch |
| **Produktivbetrieb** | ⚠️ Bedingt | Keys rotiert, Railway konfiguriert, Monitoring empfohlen |

---

## Lokale Entwicklung

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# JWT_SECRET + mindestens einen KI-Key eintragen
npm run dev
```

Secret-Scan: `npm run check:secrets`
