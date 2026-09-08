# GitHub Deploy

Repository: https://github.com/LogoMakerGermany/Creator-Branding-Studio

## Automatisch bei Push auf `main`

| Workflow | Zweck |
|----------|--------|
| **CI** (`.github/workflows/ci.yml`) | Build + Typecheck |

Railway deployt automatisch, wenn das Repo unter **Deploy from GitHub** verknüpft ist (`railway.toml` + `Dockerfile`).

## Production Architecture

- **Hosting:** Railway All-in-One (`SERVE_STATIC=true`)
- **Firebase:** Auth + Firestore + Storage (Projekt: `nexter-creator-studio`)
- **Firebase Hosting:** nicht verwendet

## GitHub Secrets (für CI)

Unter **Settings → Secrets and variables → Actions** eintragen:

### Frontend Build (`VITE_*`)

| Secret | Beispielwert |
|--------|----------------|
| `VITE_FIREBASE_API_KEY` | aus Firebase Console → Web-App |
| `VITE_FIREBASE_AUTH_DOMAIN` | `nexter-creator-studio.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `nexter-creator-studio` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `nexter-creator-studio.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | aus Firebase Console |
| `VITE_FIREBASE_APP_ID` | aus Firebase Console |
| `VITE_API_URL` | leer für All-in-One (gleiche Origin) oder die neue Nexter-Railway-Domain |

Lokal generieren: `node scripts/sync-firebase-env.mjs` (schreibt `frontend/.env.production`, nicht im Git).

## Firebase Rules Deploy (manuell)

```powershell
npm run deploy:firebase:rules
```

## Manuell pushen

```powershell
cd C:\Users\LogoM\Projects\ultimate-creator-branding-studio
git add -A
git commit -m "Deine Nachricht"
git push origin main
```

Backup-Branch mit V2-Stand: `ucbs-v2-production`
