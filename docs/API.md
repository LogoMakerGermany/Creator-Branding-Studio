# API-Referenz

Base URL: `/api/v1`

Alle authentifizierten Endpoints erfordern:
```
Authorization: Bearer <firebase-id-token>
```

## Auth

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/auth/register` | Profil nach Firebase-Registrierung anlegen |
| GET | `/auth/me` | Aktuelles User-Profil |
| PATCH | `/auth/me` | Profil aktualisieren |
| POST | `/auth/onboarding/complete` | Onboarding abschließen |

## Creator DNA

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/dna` | Alle DNAs des Users |
| POST | `/dna` | Neue DNA erstellen |
| GET | `/dna/:id` | DNA abrufen |
| PATCH | `/dna/:id` | DNA aktualisieren |
| POST | `/dna/:id/analyze` | Assets analysieren (KI) |
| POST | `/dna/:id/activate` | Als aktive DNA setzen |
| GET | `/dna/:id/versions` | Versionshistorie |

## Logo Studio

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/logo/generate` | Logo generieren |
| GET | `/logo/projects` | Logo-Projekte |
| GET | `/logo/:id` | Logo-Projekt abrufen |
| POST | `/logo/:id/export` | Export (PNG/SVG/PDF) |

## Banner / Facecam / Branding

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/banner/generate` | Banner generieren |
| POST | `/facecam/generate` | Facecam generieren |
| POST | `/branding/generate-pack` | Komplettes Branding-Paket |

## Änderungswünsche

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/change-request` | Änderungswunsch erstellen |
| GET | `/change-request/:id` | Status abrufen |
| GET | `/change-request/:id/compare` | Vorher/Nachher |
| POST | `/change-request/:id/restore` | Version wiederherstellen |

## Layout Studio

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/layout` | Layouts auflisten |
| POST | `/layout` | Layout erstellen |
| PATCH | `/layout/:id` | Layout aktualisieren |
| POST | `/layout/:id/export` | OBS/Streamlabs Export |

## KI Module

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| POST | `/assistant/chat` | Assistenten-Chat |
| POST | `/ai/image/generate` | Bild generieren |
| POST | `/ai/video/generate` | Video generieren |
| POST | `/ai/music/generate` | Musik generieren |
| POST | `/ai/voice/generate` | Stimme generieren |

## Team & Agency

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET/POST | `/team` | Teams verwalten |
| GET/POST | `/team/:id/dna` | Team DNA |
| GET/POST | `/agency` | Agenturen verwalten |
| GET/POST | `/agency/:id/members` | Mitarbeiter |
| GET/POST | `/agency/:id/clients` | Kunden |
| GET/POST | `/agency/:id/projects` | Projekte |

## Coins & Stripe

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/coins/balance` | Coin-Guthaben |
| GET | `/coins/transactions` | Transaktionshistorie |
| GET | `/coins/packages` | Verfügbare Pakete |
| POST | `/stripe/checkout` | Checkout-Session erstellen |
| POST | `/stripe/webhook` | Stripe Webhook (öffentlich) |

## Files, Marketplace, Social

| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET/POST | `/files` | Datei-Cloud |
| GET/POST | `/marketplace` | Marketplace |
| GET/POST | `/social/accounts` | Social Accounts |
| GET/POST | `/calendar` | Content Kalender |
| GET/POST | `/chat/channels` | Team Chat |

## Response Format

```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100 }
}
```

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_COINS",
    "message": "Nicht genügend Coins"
  }
}
```
