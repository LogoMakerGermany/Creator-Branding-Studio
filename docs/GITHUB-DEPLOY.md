# GitHub Deploy

Repository: https://github.com/LogoMakerGermany/Creator-Branding-Studio

## Automatisch bei Push auf `main`

| Workflow | Zweck |
|----------|--------|
| **CI** (`.github/workflows/ci.yml`) | Build + Typecheck |
| **Deploy** (`.github/workflows/deploy.yml`) | Production-Build → Firebase Hosting |

Railway deployt parallel, wenn das Repo unter **Deploy from GitHub** verknüpft ist (`railway.toml` + `Dockerfile`).

## GitHub Secrets (für Deploy-Workflow)

Unter **Settings → Secrets and variables → Actions** eintragen:

### Firebase Hosting

| Secret | Inhalt |
|--------|--------|
| `FIREBASE_SERVICE_ACCOUNT` | Kompletter JSON-Inhalt des Firebase Service Accounts (`creatorstudio-519eb`) |

### Frontend Build (`VITE_*`)

| Secret | Beispielwert |
|--------|----------------|
| `VITE_FIREBASE_API_KEY` | aus Firebase Console → Web-App |
| `VITE_FIREBASE_AUTH_DOMAIN` | `creatorstudio-519eb.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `creatorstudio-519eb` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `creatorstudio-519eb.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | aus Firebase Console |
| `VITE_FIREBASE_APP_ID` | aus Firebase Console |
| `VITE_API_URL` | `https://creatorbrandingstudioultimate-production.up.railway.app` |

Lokal generieren: `node scripts/sync-firebase-env.mjs` (schreibt `frontend/.env.production`, nicht im Git).

## Manuell pushen

```powershell
cd C:\Users\LogoM\Projects\ultimate-creator-branding-studio
git add -A
git commit -m "Deine Nachricht"
git push origin main
```

Backup-Branch mit V2-Stand: `ucbs-v2-production`
