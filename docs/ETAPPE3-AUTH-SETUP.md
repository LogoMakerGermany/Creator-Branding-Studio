# Etappe 3 — Firebase Auth & OAuth Setup

Projekt: **nexter-creator-studio**
Production: Railway All-in-One (`SERVE_STATIC=true`)

## 1. Firebase Console — Authorized Domains

Authentication → Settings → Authorized domains:

- Die neue Nexter-Railway-Domain (nach Service-Erstellung; nicht eine retired UCBS-Domain)
- `localhost` (für lokale Entwicklung)

## 2. Sign-in Methods aktivieren

Authentication → Sign-in method:

| Provider | Firebase-Typ | Hinweis |
|----------|--------------|---------|
| Google | Built-in | Client ID/Secret automatisch |
| E-Mail/Passwort | Built-in | Aktivieren |
| GitHub | Built-in | OAuth App in GitHub → Client ID/Secret |
| Apple | Built-in | Apple Developer Service ID |
| Microsoft | OIDC / Azure | Tenant + Client ID/Secret |
| Discord | OpenID Connect | Provider ID: `oidc.discord` |
| Twitch | OpenID Connect | Provider ID: `oidc.twitch` |
| TikTok | OpenID Connect | Provider ID: `oidc.tiktok` |

### OIDC Custom Provider (Discord/Twitch/TikTok)

Authentication → Sign-in method → **Add provider** → OpenID Connect:

- **Provider ID:** `oidc.discord` (bzw. `oidc.twitch`, `oidc.tiktok`)
- **Client ID / Secret:** aus Developer Portal
- **Issuer:** laut Provider-Doku

## 3. Service Account (Backend / Railway)

1. Firebase Console → Project Settings → Service accounts → Generate new private key
2. In `backend/.env.railway` eintragen:
   - `FIREBASE_PROJECT_ID=nexter-creator-studio`
   - `FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@nexter-creator-studio.iam.gserviceaccount.com`
   - `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
   - `FIREBASE_STORAGE_BUCKET=nexter-creator-studio.firebasestorage.app`

Public Keys synchronisieren:

```powershell
npm run sync:firebase-env
```

## 4. Frontend Build mit Firebase Config

```powershell
npm run sync:firebase-env
npm run build:prod
```

Das Frontend wird über Railway ausgeliefert (`SERVE_STATIC=true`), nicht über Firebase Hosting.

## 5. Railway Backend (API + Frontend)

Railway CLI (SSL-Fix auf Windows):

```powershell
$env:NODE_OPTIONS = '--use-system-ca'
npm run railway:login
npm run railway:link
# Service Account + Stripe + AI Keys in backend/.env.railway
npm run railway:deploy
```

## 6. Verifizierung

1. Railway-URL/login öffnen
2. Google / E-Mail Login testen
3. Nach Login: `/api/v1/auth/me` (über Backend) liefert `authProviders: ["google"]`

## Dev-only Guards

- `DEV_AUTH_BYPASS` — **nie** in Production
- Dev-Login Endpoint `/auth/dev-login` — blockiert wenn `NODE_ENV=production`
