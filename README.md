# Creator Branding Studio

KI-Plattform, die aus einem Logo oder Namen automatisch eine komplette Markenidentität erzeugt.

## Schnellstart

```bash
npm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
# JWT_SECRET + API-Keys in .env eintragen (niemals committen)
npm run dev
```

- **Frontend:** http://localhost:5173
- **API:** http://localhost:3001

## Anmeldung (Production)

Es gibt **keine Demo- oder Test-Accounts**. Anmeldung ausschließlich über **Firebase Auth** (E-Mail + Passwort).

```env
AUTH_PROVIDER=firebase
JWT_SECRET=<mindestens-32-zeichen-zufall>
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=<Firebase Admin PEM, Zeilenumbrüche als \\n>
ADMIN_EMAIL=admin@deine-domain.com
```

Frontend (Build-Zeit in Railway/Vite):

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Details: [`docs/AUTH_PRODUCTION_REPORT.md`](docs/AUTH_PRODUCTION_REPORT.md)

## Features

- **DNA-System** – Persistente Brand-DNA für alle Generatoren
- **Magic Prompt Engine** – Automatische KI-Prompts (unsichtbar für Nutzer)
- **20+ Generatoren** – Logo, Banner, Overlay, Stream-Elemente, etc.
- **Stream Pack** – Ein-Klick-Komplettpaket
- **Sticker Studio** – 5 Einzel-Sticker mit ZIP-Export
- **Animation Studio** – Video-Generierung mit DNA-Stil
- **Smart Format Engine** – Automatische Plattformoptimierung
- **Transparenz-System** – PNG mit Alpha, keine weißen/schwarzen Hintergründe
- **Fraud Shield & Copyright Guard** – Missbrauchserkennung
- **Security Layer** – Helmet, CSP, CSRF, Rate Limiting, Upload-Validierung
- **Admin Panel** – Benutzer, Logs, API-Nutzung

## API-Keys

Mindestens einer erforderlich:

- `OPENAI_API_KEY` – Bilder (DALL-E 3), DNA-Extraktion (GPT-4o Vision)
- `REPLICATE_API_TOKEN` – Fallback-Bilder + Video
- `RUNWAY_API_KEY` – Animation Studio

Ohne Keys startet die App, zeigt aber klare Fehlermeldungen bei Generierungen.

## Hinweise

- Video-Generierung kann 1–3 Minuten pro Clip dauern
- Stream Pack löst viele API-Aufrufe aus – Kosten beachten
- Firestore/Firebase/Deploy: vorbereitet, nicht aktiv (siehe `DB_PROVIDER`, `AUTH_PROVIDER`)

## Sicherheit

- Backend-Secrets nur über `process.env` (Railway)
- Frontend: nur `VITE_*` (öffentliche Keys)
- Secret-Scan: `npm run check:secrets`

## Hosting-Vorbereitung

- **Railway:** `railway.json`, `Dockerfile`, `docs/SECRETS_AUDIT.md`
- **Firebase:** Admin-Keys nur im Backend
- **GitHub CI:** Build + Secret-Scan

## Projektstruktur

```
apps/web/     React + Vite + Tailwind + Framer Motion
apps/api/     Express + JSON-DB + KI-Provider
packages/shared/  Typen, DNA-Schema, Plattform-Specs
```
