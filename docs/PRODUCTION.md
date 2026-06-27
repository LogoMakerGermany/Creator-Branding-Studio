# Production Deployment Guide

## Recommended architecture

| Mode | Frontend | API | When to use |
|------|----------|-----|-------------|
| **A — All-in-one (recommended to start)** | Served by Express (`SERVE_STATIC=true`) | Same Railway service | Fastest deploy, one URL, one bill |
| **B — Split** | Firebase Hosting | Railway API only | CDN edge, separate scaling |

Both modes use **Firebase Auth + Firestore + Storage** for identity and data.

---

## Option A: Railway (all-in-one)

**Vollständige Anleitung:** [docs/RAILWAY-DEPLOY.md](./RAILWAY-DEPLOY.md)

1. Push repo to GitHub and connect to [Railway](https://railway.app).
2. Railway reads `railway.toml` and builds via `Dockerfile`.
3. Set **environment variables** in Railway (see `backend/.env.example`):
   - `FIREBASE_*` (Admin SDK)
   - `PUBLIC_FIREBASE_*` + `PUBLIC_STRIPE_PUBLISHABLE_KEY` (browser client — required for Docker all-in-one)
   - `STRIPE_*` (Live keys + webhook secret + price IDs)
   - `FRONTEND_URLS=https://your-app.up.railway.app` (your Railway public URL)
   - Do **not** set `DEV_AUTH_BYPASS`
4. `SERVE_STATIC=true` is already set in the Docker image.
5. Stripe webhook: `https://your-app.up.railway.app/api/v1/stripe/webhook`
6. Verify: `GET /health`, `GET /api/v1/status`, `GET /api/v1/config/client`

Pre-deploy check:

```bash
node --env-file=backend/.env scripts/predeploy-check.mjs
```

Local test of production build:

```bash
npm run build:prod
# Windows PowerShell:
$env:SERVE_STATIC="true"; npm run start
# Linux/macOS:
SERVE_STATIC=true npm run start
```

Leave `VITE_API_URL` empty in the frontend — the SPA calls the same origin.

---

## Option B: Firebase Hosting + Railway API

### Backend (Railway)

1. Deploy API only: set `SERVE_STATIC=false` (or omit) in Railway env.
2. Set `FRONTEND_URLS` to your Firebase Hosting URL(s).

### Frontend (Firebase Hosting)

```bash
# frontend/.env — point to Railway API
VITE_API_URL=https://your-api.up.railway.app

npm run build:prod
npm run deploy:firebase
```

Or deploy rules only:

```bash
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

---

## Checklist

### 1. Firebase Auth

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication: Email/Password, Google, OIDC (Discord, Twitch, TikTok) as needed
3. Create a **Web App** → copy config to `frontend/.env`
4. Generate a **Service Account** key → `backend/.env` (`FIREBASE_*`)
5. Do **not** set `DEV_AUTH_BYPASS=true` in production
6. Deploy rules and indexes: `npm run deploy:firebase` or `firebase deploy --only firestore,storage`

### 2. Stripe Live

1. Live mode in Stripe Dashboard
2. Products/Prices for Starter, Pro, Ultimate coin packages
3. Env vars:
   - `STRIPE_SECRET_KEY=sk_live_...`
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
   - `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ULTIMATE`
4. Webhook URL: `https://<api-host>/api/v1/stripe/webhook`
5. Event: `checkout.session.completed`
6. Check: `GET /api/v1/status` → `stripe.mode: "live"`

### 3. Firestore security

Rules in `firestore.rules`:

- Users: own profile only; cannot change `role` or `coins` from client
- Creator DNA / projects: owner only
- `coin_transactions`, `processedStripeSessions`: read-only or deny — writes via Admin SDK
- Marketplace: public read, seller write

### 4. Storage security

Rules in `storage.rules`: user-scoped uploads with size and MIME limits.

### 5. RTMP live streaming

Set `RTMP_SERVER_URL` (nginx-rtmp, Mux, Cloudflare Stream, etc.). OBS uses values from `/live-streaming`.

### 6. Native app stores

- **PWA** works today (`/manifest.webmanifest`, install from browser)
- **Android/iOS**: Capacitor or React Native against the same API

### 7. Security

- Never commit `.env`
- Use `FRONTEND_URLS` for CORS when API and frontend are on different origins
- Dev login and dev coin purchase disabled when Firebase Admin is configured
- Stripe webhook idempotency: Firestore `processedStripeSessions`

---

## Health endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Load balancer / Railway healthcheck |
| `GET /api/v1/status` | Firebase, Stripe mode, RTMP config summary |

---

## Docker (manual)

```bash
docker build -t ucbs .
docker run -p 3001:3001 --env-file backend/.env ucbs
```
