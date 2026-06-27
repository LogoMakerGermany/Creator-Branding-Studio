# Architektur – ULTIMATE CREATOR BRANDING STUDIO

## Systemübersicht

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  React Web App (Vite) │ Android App │ iOS App (Phase 5)         │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS / REST API
┌──────────────────────────────▼──────────────────────────────────┐
│                        API LAYER (Railway)                       │
│  Express.js + TypeScript                                         │
│  ├── Auth Middleware (Firebase Admin)                            │
│  ├── Rate Limiting                                               │
│  ├── Role-Based Access Control                                   │
│  └── Route Handlers                                              │
└──────┬──────────────┬──────────────┬──────────────┬─────────────┘
       │              │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐
│  Firestore  │ │ Firebase  │ │  Stripe   │ │ AI APIs   │
│  (Database) │ │  Storage  │ │ (Payment) │ │ OpenAI,   │
│             │ │           │ │           │ │ Runway,   │
│             │ │           │ │           │ │ Replicate │
└─────────────┘ └───────────┘ └───────────┘ └───────────┘
```

## Monorepo-Struktur

| Package | Beschreibung |
|---------|--------------|
| `frontend/` | React SPA mit Vite, TailwindCSS, React Router |
| `backend/` | Express REST API, Firebase Admin, Stripe Webhooks |
| `shared/` | Gemeinsame TypeScript-Typen und Konstanten |

## Kernkonzept: Creator DNA Engine

Die Creator DNA Engine ist das zentrale Element. Alle Module lesen die aktive DNA und generieren konsistente Assets:

```
Upload/Analyse → Creator DNA → Module (Logo, Banner, Video, etc.)
                      ↓
              Branding Rules, Colors, Fonts, Style
```

## Authentifizierung

1. Client: Firebase Auth SDK (Google, Discord, Twitch, TikTok = custom OAuth)
2. Client sendet Firebase ID Token im `Authorization: Bearer` Header
3. Backend: Firebase Admin SDK verifiziert Token
4. Backend lädt User-Profil aus Firestore (Rolle, Permissions)
5. RBAC Middleware prüft Berechtigungen pro Route

## Coin-System Flow

```
Stripe Checkout → Webhook → Coin Transaction → User Balance Update
                                    ↓
Module Action → Check Balance → Deduct Coins → Execute AI Job
```

## Deployment (Railway)

- **Backend:** Node.js Service, Port aus `PORT` env
- **Frontend:** Static build served via CDN oder Railway static
- **Environment:** Firebase credentials, Stripe keys, AI API keys

## Phasen-Roadmap

Siehe README.md für den vollständigen Phasenplan.
