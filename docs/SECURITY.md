# UCBS Security Guide

## Secret management (Railway only)

**All server secrets belong in Railway Variables** (or local `backend/.env` for development only). Never commit secrets to git. Never put server keys in the frontend.

| Variable | Where | Purpose |
|----------|-------|---------|
| `FIREBASE_PRIVATE_KEY` | Railway only | Firebase Admin |
| `FIREBASE_CLIENT_EMAIL` | Railway only | Firebase Admin |
| `STRIPE_SECRET_KEY` | Railway only | Payments |
| `STRIPE_WEBHOOK_SECRET` | Railway only | Webhook verification |
| `OPENAI_API_KEY` | Railway only | AI generation |
| `REPLICATE_API_TOKEN` | Railway only | AI generation |
| `DEV_AUTH_BYPASS` | **Never in production** | Local dev only |

Frontend (`frontend/.env`) may only contain **public** keys:

- `VITE_FIREBASE_*` (client SDK — restrict in Firebase Console)
- `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_` / `pk_live_`)
- `VITE_API_URL` (public API URL)

Railway all-in-one (`SERVE_STATIC=true`) uses **runtime** public config on the API:

- `PUBLIC_FIREBASE_*` (same values as `VITE_FIREBASE_*`)
- `PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Served at `GET /api/v1/config/client` — no rebuild when URLs change

## Production hardening (implemented)

- **Startup validation:** App exits if Firebase Admin or `FRONTEND_URL` missing in production
- **No dev mode in production:** `dev_*` tokens, dev-login, dev-purchase disabled
- **Helmet + CSP** on API/static responses
- **Rate limits:** Auth (30/15min), API (200/15min), uploads (40/15min), Stripe webhook (300/min)
- **CORS:** Strict origin allowlist in production
- **IDOR fixes:** Team, agency, chat, client portal ownership checks
- **Upload validation:** MIME allowlist, 5 MB max, 100 files/user
- **Stripe webhook:** Signature verification + `payment_status === 'paid'` + amount check
- **Firestore rules:** Fixed role/coins on user create
- **Storage rules:** Users can only read own files

## Railway deploy checklist

1. Set `NODE_ENV=production`
2. Set all `FIREBASE_*` variables
3. Set `FRONTEND_URL` to your public URL
4. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
5. Set AI keys as needed (`OPENAI_API_KEY`, etc.)
6. **Do not set** `DEV_AUTH_BYPASS`
7. Deploy Firebase rules: `npm run deploy:firebase`

## Local development

```powershell
# backend/.env
NODE_ENV=development
DEV_AUTH_BYPASS=true   # optional, local only
```

Use `POST /api/v1/auth/dev-login` only locally. Production rejects it.

## Reporting issues

Security issues: contact project owner directly — do not open public issues with exploit details.
