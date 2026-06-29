# Etappe 6 — Social, Assistant, Calendar, Chat, File Cloud

## Änderungen

### Social Media
- **Keine Fake-Engagement-Zahlen** mehr beim Veröffentlichen
- **Medien-Upload** (`mediaDataUrl`) → Firebase Storage unter `social/`
- Geplante Posts erzeugen automatisch einen **Content-Kalender**-Eintrag
- UI: Bild-Upload, ehrlicher Hinweis (lokaler Status, kein Auto-Post an Plattformen)

### KI Assistent
- **Production:** `OPENAI_API_KEY` erforderlich — sonst `503 AI_UNAVAILABLE`
- **Dev:** Keyword-Fallback nur in Dev-Mode
- **Konversationshistorie** (letzte 12 Nachrichten) an OpenAI

### Content Kalender
- **Datumsvalidierung** (`parseIsoDate`) mit `ServiceError`
- CRUD unverändert produktionsfähig

### Team Chat
- Willkommensnachricht nur in **Dev-Mode**
- Kanalname nutzt **Team-Name**, falls User in einem Team ist
- `ServiceError` für Zugriffsfehler

### Datei Cloud
- Upload-Validierung via `parseAndValidateDataUrl` / `parseAndValidateVideoDataUrl`
- Kategorie **sticker** im Upload-Endpoint
- Frontend: **Bildvorschau** aus `downloadUrl`

## API Keys

| Modul | Env-Variable |
|-------|--------------|
| KI Assistent | `OPENAI_API_KEY` |
| Datei-Uploads | `FIREBASE_STORAGE_BUCKET` + Firebase Admin |

## Tests

```bash
node scripts/test-etappe6.mjs
npm run typecheck
```

## Hinweis Social

Echte Plattform-Integration (Instagram API, TikTok OAuth, …) ist **nicht** Teil dieser Etappe. Posts werden in UCBS verwaltet; „Veröffentlichen“ markiert den Status lokal.
