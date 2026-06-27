# Railway Deploy — UCBS (All-in-One)

Schritt-für-Schritt für **Option A** aus [PRODUCTION.md](./PRODUCTION.md): ein Service, eine URL, Frontend + API zusammen.

## Schnellstart (Railway CLI — ohne GitHub)

```powershell
$env:NODE_OPTIONS = '--use-system-ca'   # falls npm SSL-Fehler (UNABLE_TO_VERIFY_LEAF_SIGNATURE)
npm run railway:login
npm run railway:link
```

copy backend\.env.railway.example backend\.env.railway
# → Firebase, Stripe, PUBLIC_FIREBASE_* eintragen

node --env-file=backend/.env.railway scripts/predeploy-check.mjs
npm run railway:deploy
```

Einzeln: `npm run railway:vars` → `npm run railway:up`

Nach dem ersten Deploy: Railway-URL in `FRONTEND_URL` / `FRONTEND_URLS` → erneut `npm run railway:vars` → `npm run railway:up`

---

## Voraussetzungen

- GitHub-Repository mit diesem Code
- [Firebase](https://console.firebase.google.com) Projekt
- [Railway](https://railway.app) Account
- [Stripe](https://dashboard.stripe.com) Live-Modus (oder Test zum Ausprobieren)

---

## 1. Firebase einrichten

1. Neues Projekt → **Authentication** aktivieren (E-Mail, Google, ggf. OIDC)
2. **Firestore** + **Storage** aktivieren
3. **Web-App** registrieren → Client-Konfiguration notieren
4. **Service Account** → JSON-Key → Werte für `FIREBASE_*` (Admin)
5. Lokal Rules deployen (einmalig):

```bash
npx firebase-tools login
npx firebase-tools use your-project-id
npm run deploy:firebase
```

Oder nur Rules:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

---

## 2. GitHub pushen

```bash
git init
git add .
git commit -m "Initial UCBS production release"
git branch -M main
git remote add origin https://github.com/DEIN-USER/ultimate-creator-branding-studio.git
git push -u origin main
```

---

## 3. Railway Service

1. **New Project** → **Deploy from GitHub** → Repo wählen
2. Railway erkennt `railway.toml` + `Dockerfile` automatisch
3. **Variables** setzen (alle aus `backend/.env.example`):

### Pflicht (Production)

| Variable | Hinweis |
|----------|---------|
| `NODE_ENV` | `production` |
| `SERVE_STATIC` | `true` (bereits im Docker-Image) |
| `FIREBASE_PROJECT_ID` | Admin |
| `FIREBASE_CLIENT_EMAIL` | Admin |
| `FIREBASE_PRIVATE_KEY` | Mit `\n` für Zeilenumbrüche |
| `FIREBASE_STORAGE_BUCKET` | z. B. `projekt.appspot.com` |
| `FRONTEND_URL` | Railway-URL nach erstem Deploy, z. B. `https://ucbs-production.up.railway.app` |
| `FRONTEND_URLS` | Gleiche URL (kommagetrennt bei mehreren) |
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_STARTER` / `PRO` / `ULTIMATE` | Price IDs aus Stripe |
| `OPENAI_API_KEY` oder `REPLICATE_API_TOKEN` | Mind. einer |
| `PUBLIC_FIREBASE_API_KEY` | Web-App Client (öffentlich) |
| `PUBLIC_FIREBASE_PROJECT_ID` | Web-App |
| `PUBLIC_FIREBASE_AUTH_DOMAIN` | Web-App |
| `PUBLIC_FIREBASE_STORAGE_BUCKET` | Web-App |
| `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Web-App |
| `PUBLIC_FIREBASE_APP_ID` | Web-App |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |

### Optional

| Variable | Hinweis |
|----------|---------|
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | `PAYPAL_MODE=live` |
| `ELEVENLABS_API_KEY`, `SUNO_API_KEY`, … | KI-Module |

### Nie setzen

- `DEV_AUTH_BYPASS`

---

## 4. Nach dem ersten Deploy

1. Railway **öffentliche URL** kopieren
2. `FRONTEND_URL` und `FRONTEND_URLS` auf diese URL setzen → **Redeploy**
3. Firebase Console → **Authorized domains** → Railway-Domain hinzufügen
4. Stripe → **Webhooks** → `https://DEINE-URL/api/v1/stripe/webhook` → Event `checkout.session.completed`
5. PayPal (falls genutzt): Return-URL auf `/coins?success=1`

---

## 5. Verifizieren

```bash
curl https://DEINE-URL/health
curl https://DEINE-URL/api/v1/status
curl https://DEINE-URL/api/v1/config/client
```

Erwartung:

- `/health` → `{"status":"ok"}`
- `/status` → `environment: production`, `stripe.mode: live`
- `/config/client` → Firebase-Client-Konfiguration (ohne Secrets)

Im Browser: Login, Dashboard, Coins-Checkout testen.

---

## 6. Lokaler Produktions-Test

```powershell
npm run build:prod
$env:NODE_ENV="production"
$env:SERVE_STATIC="true"
# Alle Variablen aus backend/.env laden
npm run start
```

Checkliste vor Deploy:

```bash
node --env-file=backend/.env scripts/predeploy-check.mjs
```

---

## Option B: Firebase Hosting + Railway API

Siehe [PRODUCTION.md](./PRODUCTION.md) — dann `SERVE_STATIC=false` auf Railway, `VITE_API_URL` beim Frontend-Build setzen, `npm run deploy:firebase` für Hosting.

---

## Troubleshooting

| Problem | Lösung |
|---------|--------|
| App startet nicht | Railway Logs — meist fehlende `FIREBASE_*` oder `PUBLIC_FIREBASE_*` |
| Login schlägt fehl | Authorized domain in Firebase + `FRONTEND_URL` korrekt |
| Stripe Webhook 4xx | `STRIPE_WEBHOOK_SECRET` + URL in Stripe Dashboard |
| Leere Seite / 404 | `SERVE_STATIC=true`, Docker-Build erfolgreich |
| CSP blockiert Fonts | Neueste Version deployen (CSP inkl. Google Fonts) |
