# NEXTER V1 — Production Runbook

This document describes **required operator procedures**. It does not claim that backups, APM, or payment sandboxes run automatically.

Legal texts remain **ENTWURF – VOR VERÖFFENTLICHUNG RECHTLICH PRÜFEN**. Cursor must not mark them as final.

---

## 1. Backup

**Required before any public go-live (manual operator duty):**

| Asset | Why | How (operator) |
| --- | --- | --- |
| Firestore | Users, DNA, projects, coin ledger, admin audit, jobs, quotes, feedback | Scheduled Firestore export / GCP backup. Enable PITR if the project allows it. |
| Cloud Storage | Uploads, generated assets, export ZIPs, feedback screenshots if stored there | Bucket versioning + periodic export to a second bucket/region. |
| Coin ledger + admin audit | Money and privilege trail | Same Firestore export. Never prune these collections as “cleanup”. |

**Project ZIP is not a database backup.** A user export ZIP contains that user’s project files. It cannot restore other users, ledger, audit, payments, or system settings.

**Recovery behaviour**

- Restore Firestore export to a staging project first. Spot-check: one user, one project, coin balance vs. last ledger row, one audit entry.
- Restore Storage objects that ledger/jobs reference. Broken URLs are missing files, not silent success.
- After restore: run Job Recovery (`POST /api/v1/admin/jobs/recover` as admin, or process restart which already calls `recoverStaleJobs`). Charged stale jobs refund **once**.
- Payment recovery: Stripe/PayPal webhooks are the source of truth. Replaying a webhook must **not** mint coins twice (idempotency key = provider payment id). If a claim is `failed`, inspect claim + ledger before any manual credit.

**Do not invent automated backups.** If GCP scheduled export is not configured, backups are **not** in place.

---

## 2. Payment (mandatory before public sale)

Automated tests must **not** use live keys or real charges.

### Stripe (test mode)

1. Test Checkout with a test card.
2. Confirm webhook `checkout.session.completed` (or equivalent) is received (`STRIPE_WEBHOOK_SECRET`).
3. Confirm coins appear on the user.
4. Confirm a `coin_transactions` ledger row (welcome is separate; purchase is purchase).
5. Replay the same webhook / retry: **no double coins**.
6. Failed checkout: **no coins**.

### PayPal (sandbox)

1. Sandbox order → capture.
2. Webhook with `PAYPAL_WEBHOOK_ID` verified.
3. Coins + ledger.
4. Retry the same capture/webhook: **no double coins**.

### Live

Only after Stripe test **and** PayPal sandbox (if PayPal will be offered) succeed. Then switch to live keys. Never mix live keys in automated tests.

---

## 3. Providers

Status API reports **configured** (key present), not **online**. `liveChecked` is always false; `available` is always null until a real ping exists.

| Provider env | Used for | If missing |
| --- | --- | --- |
| `OPENAI_API_KEY` | Nexter chat, DNA analysis, text/content, some image/video analysis | Nexter chat/`AI_UNAVAILABLE` or `AI_NOT_CONFIGURED`. Onboarding **wizard still works** (no OpenAI required). Logo/text generation fails and **refunds** charged coins. |
| `REPLICATE_API_TOKEN` | Image/video generation fallback / video thumbnails | Those jobs fail with `AI_NOT_CONFIGURED` + refund. |
| `RUNWAY_API_KEY` | Runway video | Runway path unavailable; no fake success. |
| `ELEVENLABS_API_KEY` | Voice | Voice jobs fail; no fake audio. |
| `RESEND_API_KEY` + `EMAIL_FROM` | Transactional mail (welcome, invite, purchase) | App runs; mails are not sent. Coins/ledger must not roll back because mail failed. |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Coin purchase | Checkout disabled / `PAYMENT_FAILED`. |
| `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` + `PAYPAL_WEBHOOK_ID` | PayPal purchase | PayPal path disabled. |
| Firebase Admin | Auth, Firestore, Storage | Production process **refuses to start**. |

There is **no automatic provider fallback** that pretends a missing provider succeeded.

App theme personalization (custom studio chrome colors) is **not** a persistent theme engine in V1. Onboarding notes this; it is later work.

---

## 4. Observability (no APM claimed)

Operators should regularly check:

- `GET /health` — liveness/readiness. Production returns 503 if Firebase/Stripe/image-AI are not ready.
- `GET /api/v1/status` — environment, provider **configured** flags, kill switches, `devLogin`/`devCoinPurchase` (must be false in production).
- Admin: failed / interrupted jobs, payment claims (`failed`), admin audit, recovery logs (stdout `[shutdown]`, job recovery counts).
- Firestore: `billable_charges` stuck in `charged`, `coin_idempotency` duplicates.

This is **not** Datadog/Sentry/APM. If those are not installed, they are not running.

---

## 5. Dev safety

Production must refuse:

- `DEV_AUTH_BYPASS=true` (startup validation)
- Dev-Login (`POST /api/v1/auth/dev-login`)
- Dev purchase (`/stripe/dev-purchase`, PayPal equivalent)
- Demo marketplace / mock payments

---

## 6. Docker

Image: repository `Dockerfile` (Node 20 Alpine, `SERVE_STATIC=true`, `HEALTHCHECK` on `/health`).

A successful **image build** is required before calling the image shippable. **This Phase-J run did not build the image:** the machine had no `docker` CLI. Do not treat NEXTER as “Docker ready” until `docker build` succeeds on an operator workstation and `/health` + `/api/v1/status` are checked on that container.

Production boot still needs real Railway secrets; an empty production container will exit on config validation.

---

## 7. Tester grant

Welcome stays `DEFAULT_FREE_COINS` (50). Testers receive **+500** via admin `POST /api/v1/admin/users/:userId/tester-grant` with idempotency key `tester-grant-500:{userId}`. Expected balance after welcome + grant: **550**.

---

## 8. Legal / release

Legal pages stay drafts until counsel replaces them.

- **CLOSED TESTER READY** can be yes with draft legal (invite-only testers).
- **PUBLIC READY** stays **no** until final legal texts are in place **and** payment sandboxes have been executed by an operator.
