# NEXTER Production Deployment

Canonical operator procedure for the **existing** Railway all-in-one service. This is infrastructure documentation only. It does not activate payments, providers, OAuth, or email.

Do **not** paste private keys, tokens, or Railway tokens into chat, tickets, or terminal logs. Secrets stay in Railway Variables.

---

## Architecture

- One Railway service builds the monorepo `Dockerfile` (Node 20 Alpine).
- Image builds `shared` + `frontend` + `backend`, then runs Express.
- Express serves the SPA (`SERVE_STATIC=true` in the image) and `/api/v1`.
- Identity and data: Firebase Auth + Firestore + Storage (external). No Railway Postgres/Redis/volume.
- No Firebase Hosting.

| Item | Value |
| --- | --- |
| Production URL | `https://nexter-creator-studio-production.up.railway.app` |
| Railway project | `spectacular-nourishment` |
| Environment | `production` |
| Service | `nexter-creator-studio` |
| GitHub repo | `LogoMakerGermany/Creator-Branding-Studio` |
| Release branch used for commits | `cursor/phase1-invite-pricing-ledger` |
| Linked GitHub default branch (dashboard) | `main` — do not switch; deploys pin an explicit commit SHA |
| Builder | `DOCKERFILE` |
| Dockerfile | `/Dockerfile` (repo root) |
| Root directory | repository root |
| Build command | none (Dockerfile) |
| Start command | none in Railway — image `CMD ["node", "dist/index.js"]` with `WORKDIR /app/backend` |
| Health | `GET /health` (no auth, no mutations, no provider/email/payment calls) |
| Restart policy (config-as-code) | `ON_FAILURE`, max retries `3` (overrides dashboard default `10`) |
| Replicas | `1` (do not change in this procedure) |
| Region | `sfo` (do not change in this procedure) |
| Volumes | none |
| Cron | none |
| Retired host | `creatorbrandingstudioultimate-production.up.railway.app` — denylist only, never an active domain |

---

## Config-as-Code

- **Current file:** `railway.toml` (exactly one format; no `railway.json`).
- **Status:** Config-as-Code (`railway.toml` / `railway.json`) is deprecated for **new** services. This existing service still reads the file until **2026-12-01** (Railway hard cutoff, official docs).
- **Replacement:** `.railway/railway.ts` via Railway CLI 5.x `railway config plan` / `apply`. This repo pins `@railway/cli` **4.6.3**, which has **no** `railway config` command. Do not invent an IaC file until that CLI can validate a plan without changing env, domain, replicas, or secrets.
- **Validation:** field allowlist against [railway.schema.json](https://railway.com/railway.schema.json). No env values in the file.
- File settings override the dashboard for that deploy. The dashboard is **not** rewritten (expected Railway behavior).

### Config drift vs live dashboard snapshot

| Setting | Dashboard GraphQL snapshot | `railway.toml` | Result |
| --- | --- | --- | --- |
| Builder | `DOCKERFILE` | `DOCKERFILE` | MATCH |
| Dockerfile | `/Dockerfile` | `Dockerfile` | MATCH (normalized) |
| Start command | `null` | omitted | MATCH — Docker CMD |
| Build command | `null` | omitted | MATCH |
| Health path | `null` | `/health` | INTENTIONAL — file wins |
| Health timeout | `null` | `30` | INTENTIONAL — file wins |
| Restart type | `ON_FAILURE` | `ON_FAILURE` | MATCH |
| Restart retries | `10` | `3` | INTENTIONAL — file wins |
| Replicas / region / volumes | `1` / `sfo` / none | omitted | INTENTIONAL — not locked in code |

---

## Required ENV names (values stay in Railway)

**REQUIRED AT STARTUP (production)**

- `NODE_ENV=production`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `FRONTEND_URL` or `FRONTEND_URLS`
- `PUBLIC_FIREBASE_API_KEY` and `PUBLIC_FIREBASE_PROJECT_ID` when `SERVE_STATIC=true`

**RAILWAY PROVIDED**

- `PORT` — process must use `process.env.PORT` (image default `8080`)

**PRESERVED IMAGE / FAIL-CLOSED DEFAULTS (do not flip in this procedure)**

- `SERVE_STATIC=true` (Dockerfile)
- `PAYMENTS_ENABLED=false`
- `DEV_AUTH_BYPASS` must not be `true`

**OPTIONAL / FAIL-CLOSED FEATURES** (missing keys must not crash `/health`)

- Chat: `NEXTER_CHAT_ENABLED=true` **and** `OPENAI_API_KEY`
- Image live: `IMAGE_GENERATIONS_ENABLED=true` **and** provider configuration
- Video: `VIDEO_GENERATIONS_ENABLED=true` **and** RUNWAY_API_KEY or REPLICATE_API_TOKEN
- Music: `MUSIC_GENERATIONS_ENABLED=true` **and** REPLICATE_API_TOKEN (MusicGen). One Replicate token does not enable image, music, and video together
- TTS provider: `TTS_GENERATION_ENABLED=true` **and** provider key (browser TTS stays 0 coins)
- Transactional email: `RESEND_API_KEY` + `EMAIL_FROM`
- Payments: Stripe / PayPal names only if payments are later enabled
- OAuth client IDs/secrets: only when that provider is configured

Never commit values. Never set activation flags from this document.

---

## Health semantics

`GET /health` returns `{ "status": "ok" }` when the process is ready.

Production readiness is Firebase Admin + startup config issues. It does **not** fail because:

- Payments are OFF
- ElevenLabs / Resend / image / music / video providers are unavailable

A bad Firebase Admin config still fail-closes startup (no Dev Store fallback). `DEV_AUTH_BYPASS` in production is a startup issue, not a silent bypass.

---

## Deploy procedure

1. `npm test`
2. `npm run typecheck` and backend + frontend `npm run build`
3. Secret scan the diff (no live Stripe secrets, PEM blocks, or Railway API tokens)
4. Commit on `cursor/phase1-invite-pricing-ledger`
5. Push, then deploy the **existing** service `nexter-creator-studio` in environment `production` (explicit commit SHA). No env/domain/replica/volume/database changes.
6. Wait until Railway deployment `SUCCESS` and `GET /health` → 200
7. Read-only smoke: `/api/v1/status` (Firebase production, payments off, invite_only, no provider activation), `GET /`, `GET /login`, `GET /legal/impressum`, one SPA path such as `/nexter` (HTML shell, no login)
8. If unhealthy, rollback (below)

Do not run `railway variables set/delete/update`. Do not use `npm run railway:vars` as part of a normal code deploy.

---

## Rollback procedure

Block J does not write Firestore or Storage. Rollback is **redeploy the previous successful commit**.

Last known-good before this Block J release:

`37e16c7981e62b8b3bdba803b680c9a6ae968124`

Trigger: `/health` not 200, startup crash, Firebase Admin unexpectedly OFF, Dev Store ON, `DEV_AUTH_BYPASS` ON, Payments ON, or SPA broken.

Redeploy that commit to the same service. No data rollback.

---

## Read-only smoke

```text
GET https://nexter-creator-studio-production.up.railway.app/health
GET https://nexter-creator-studio-production.up.railway.app/api/v1/status
GET https://nexter-creator-studio-production.up.railway.app/
GET https://nexter-creator-studio-production.up.railway.app/login
GET https://nexter-creator-studio-production.up.railway.app/legal/impressum
GET https://nexter-creator-studio-production.up.railway.app/nexter
```

Expect: health `ok`; status `environment=production`, Firebase Admin on, Firestore production, `devLogin=false`, `paymentsEnabled=false`, `registration.mode=invite_only`. Deep links return the SPA shell (HTTP 200), not a platform 404.

---

## Block L — concurrency, locks, emulator

Isolated E2E lives in `backend/src/services/nexter-live-e2e.test.ts` plus the existing node:test suite (`tsx --test --test-concurrency=1`). No Cypress/Vitest. Tests write only the per-process Dev Store (`ucbs-dev-store-${pid}`). `dsSet` / `dsDelete` / coin Firestore mutations abort when `NODE_TEST` is set and `isDevMode()` is false (including `FIREBASE_PROJECT_ID=nexter-creator-studio`).

`firebase.json` has no emulator stanza. **FIRESTORE EMULATOR CONCURRENCY: NOT RUN – ENVIRONMENT LIMITATION.** Do not claim real Firestore transaction races were executed.

### Process-local locks (not multi-replica)

- `withDevLock` (`backend/src/lib/dev-mutex.ts`) — in-process mutex, now always used for quote confirm, user sync, file delete, chat budget, email dispatch.
- `liveNexterChatInFlight` — in-memory `Set` in `conversation.service.ts` (live OpenAI path only).
- `express-rate-limit` `apiLimiter` / `authLimiter` / `uploadLimiter` — per Node process.

### Datastore / transaction based (multi-instance safe)

- Coin debit / refund / welcome idempotency: Firestore `runTransaction` in production; Dev Store mutex in tests.
- Invite `maxUses` consume: Firestore `runTransaction` in production.
- Quote confirm uniqueness on one replica: process lock + quote `processing`/`confirmed` replay. Across replicas this is **PARTIAL** until a Firestore compare-and-set exists. Current Railway **REPLICAS = 1**.
- NEXTER chat 40/60min budget: persisted `nexter_chat_usage` but the increment lock is process-local. **PARTIAL** at replicas > 1.
- Rate limiters: **process-local**. Not launch-P0 at 1 replica. Do not add Redis in this block.

**MULTI-INSTANCE SAFETY:** PARTIAL (replicas=1; economic debit/refund/invite/welcome are transactional; quote double-click and chat/API rate limits are process-local).

### Signed URL vs delete

A signed download URL minted **before** delete may remain reachable until TTL (`SIGNED_URL_TTL_MS`). After the file is `deleted`, **new** signed URLs are not issued. That is existing semantics, not a revocation guarantee.

### Creator DNA races

Parallel `upsertDna` is last-write-wins. No version lock.

### Production auth E2E

Automated login for `larsegal23@googlemail.com` is **MANUAL / NOT RUN** without an existing session. Operators may use this read-only checklist (no quote confirm, no generation, no coin purchase):

1. Login
2. Dashboard
3. Open NEXTER
4. Creator DNA visible
5. Open Logo Studio
6. Coins visible
7. Open Files / Projects
8. Open Settings
9. Logout

