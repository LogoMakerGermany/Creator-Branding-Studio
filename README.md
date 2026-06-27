# ULTIMATE CREATOR BRANDING STUDIO

All-in-One KI-Plattform für Creator, Streamer, Gamer, Teams, Clans, Agenturen, Musiker und Unternehmen.

**Release-Modell: Reine Web-App** — läuft im Browser (Desktop & Mobil). Keine App-Store-Pflicht. Optional installierbar als PWA.

## Web-App deployen (empfohlen)

Ein Container auf Railway liefert **Frontend + API** unter einer URL:

```bash
npm run build:prod
# Lokal testen:
# PowerShell: $env:SERVE_STATIC="true"; npm run start
```

| Variable | Wert |
|----------|------|
| `SERVE_STATIC` | `true` (im Dockerfile bereits gesetzt) |
| `FRONTEND_URLS` | Deine öffentliche URL, z. B. `https://app.deine-domain.de` |
| `VITE_API_URL` | **leer lassen** beim Build — die Web-App ruft dieselbe Domain auf |

Firebase deployt nur **Rules, Indexes & optional Hosting** — die API läuft auf Railway.

## Tech Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | React, TypeScript, TailwindCSS, Vite |
| Backend | Node.js, Express, TypeScript |
| Datenbank | Firebase Firestore |
| Auth | Firebase Auth (Google, Discord, Twitch, TikTok) |
| Storage | Firebase Storage |
| Hosting | Railway (Web-App + API, ein Service) |
| Zahlungen | Stripe |
| KI | OpenAI, Runway, Replicate, ElevenLabs, Suno, Fal.ai, Stability AI |

## Projektstruktur

```
ultimate-creator-branding-studio/
├── frontend/          # React Web-App
├── backend/           # Express API
├── shared/            # Gemeinsame TypeScript-Typen
└── docs/              # Architektur & DB-Dokumentation
```

## Release v1.0 – Produktions-Checkliste

Vor dem Go-Live müssen diese Services konfiguriert sein:

| Service | Env-Variablen |
|---------|---------------|
| Firebase | `FIREBASE_*`, `FIREBASE_STORAGE_BUCKET` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Price IDs |
| KI Bilder | `OPENAI_API_KEY` und/oder `REPLICATE_API_TOKEN` |
| KI Stimme | `ELEVENLABS_API_KEY` (optional, empfohlen) |
| KI Musik | `REPLICATE_API_TOKEN` oder `SUNO_API_KEY` |
| Frontend | `VITE_FIREBASE_*` — `VITE_API_URL` **leer** bei All-in-one-Web-App |

```bash
npm run deploy:firebase   # Rules + Indexes + Hosting
```

## Phasenplan (Feature-Übersicht)

- **Phase 1:** Login, Coin-System, Creator DNA, Logo/Banner/Facecam Studio, Branding Generator
- **Phase 2:** Layout Studio, Änderungswünsche, Creator Assistent, Team/Agentur DNA
- **Phase 3:** Video Studio, Intro/Outro, VTuber Studio
- **Phase 4:** Marketplace, White Label, Agenturverwaltung, Kundenportal
- **v1.0:** Reine Web-App (PWA) — Branding, Studios, Marketplace, Social
- **Späteres Update:** Live Streaming Tools (RTMP, Multistream) — **keine Streaming-Plattform in v1.0**

> **Geplant als späteres Major-Update:** Eigene Streaming-Plattform (Kanäle, HLS, Chat, VOD, Subs) — siehe [Future Roadmap](./docs/FUTURE-ROADMAP.md)

## Setup

```bash
# Abhängigkeiten installieren
npm install

# Umgebungsvariablen kopieren
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Entwicklung starten (Frontend + Backend)
npm run dev
```

## Dokumentation

- [Architektur](./docs/ARCHITECTURE.md)
- [Datenbankschema](./docs/DATABASE.md)
- [API-Referenz](./docs/API.md)
- [Benutzerrollen](./docs/ROLES.md)
- [Production & Deploy](./docs/PRODUCTION.md)
- [Future Roadmap – Streaming Plattform](./docs/FUTURE-ROADMAP.md)
- [Security](./docs/SECURITY.md)

## Production deploy (Kurz)

**Railway (empfohlen, All-in-one):** Repo verbinden → Env vars aus `backend/.env.example` setzen → Deploy via `Dockerfile` / `railway.toml`. Schritt-für-Schritt: [docs/RAILWAY-DEPLOY.md](./docs/RAILWAY-DEPLOY.md)

```bash
npm run build:prod
SERVE_STATIC=true npm run start   # lokal testen
```

**Firebase (Split):** Frontend auf Hosting, API auf Railway — Details in [PRODUCTION.md](./docs/PRODUCTION.md).

```bash
npm run deploy:firebase
```
