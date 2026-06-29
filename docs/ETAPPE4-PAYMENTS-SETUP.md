# Etappe 4 — Payments Setup (Stripe, PayPal, Coins)

## Coin-Pakete (Shared)

| Paket | Coins | Bonus | Preis |
|-------|-------|-------|-------|
| Starter | 100 | — | 4,99 € |
| Pro | 500 | +50 | 19,99 € |
| Ultimate | 1500 | +200 | 49,99 € |

Definiert in `shared/src/coin-packages.ts` — Backend und Frontend nutzen dieselben Werte.

---

## Stripe (Pflicht in Production)

### Env-Variablen

| Variable | Beschreibung |
|----------|--------------|
| `STRIPE_SECRET_KEY` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_STARTER` | Price ID (optional, sonst `price_data`) |
| `STRIPE_PRICE_PRO` | Price ID |
| `STRIPE_PRICE_ULTIMATE` | Price ID |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` |

### Webhook

URL: `https://DEINE-API-URL/api/v1/stripe/webhook`

Events:
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`

Idempotenz: Firestore `processedStripeSessions`

### Return Flow

Success: `/coins?success=true&session_id={CHECKOUT_SESSION_ID}`  
Frontend ruft `/stripe/verify-session` auf (Fallback wenn Webhook verzögert).

---

## PayPal (Optional)

### Env-Variablen

| Variable | Beschreibung |
|----------|--------------|
| `PAYPAL_CLIENT_ID` | Live Client ID |
| `PAYPAL_CLIENT_SECRET` | Live Secret |
| `PAYPAL_MODE` | **`live`** in Production |
| `PAYPAL_WEBHOOK_ID` | Webhook ID aus PayPal Developer Dashboard |

In Production: wenn PayPal konfiguriert ist, müssen `PAYPAL_MODE=live` und `PAYPAL_WEBHOOK_ID` gesetzt sein (Startup-Validierung).

### Webhook

URL: `https://DEINE-API-URL/api/v1/paypal/webhook`

Signaturprüfung via PayPal `verify-webhook-signature` API.

Events:
- `CHECKOUT.ORDER.APPROVED`
- `PAYMENT.CAPTURE.COMPLETED`

Idempotenz: Firestore `processedPayPalOrders`

---

## Dev-only Endpoints

| Endpoint | Guard |
|----------|-------|
| `POST /stripe/dev-purchase` | `!isProduction() && isDevAuthEnabled()` |
| `POST /paypal/dev-purchase` | `!isProduction() && isDevAuthEnabled()` |

Frontend zeigt Dev-Kauf nur wenn `platform.features.devCoinPurchase === true`.

---

## Verifizierung

```bash
node scripts/test-etappe4.mjs
npm run typecheck
```

Live-Test:
1. `/coins` öffnen — Stripe/PayPal Badges (Live/Sandbox)
2. Testkauf Starter-Paket
3. Guthaben + Transaktion mit Provider-Metadaten prüfen
4. Webhook-Logs in Stripe/PayPal Dashboard
