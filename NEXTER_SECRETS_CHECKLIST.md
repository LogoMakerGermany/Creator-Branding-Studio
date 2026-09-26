# NEXTER Secrets Checklist

Nur Variablennamen. Keine Werte eintragen. Produktion setzt diese Namen in Railway Variables. Lokal nur in `backend/.env`, die nicht committed wird.

Ein Feature ist live, wenn das genannte Flag exakt `true` ist und alle als notwendig markierten Variablen gesetzt sind. Sonst bleibt es fail-closed.

Microsoft-Client-Secret gehört in die Firebase Console, nicht in dieses Repository und nicht in Railway.

| Variable | Beschreibung | Provider | Notwendigkeit | Feature-Flag |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `production` in Railway | Prozess | notwendig zum Start | — |
| `PORT` | Setzt Railway | Prozess | notwendig, von der Plattform | — |
| `SERVE_STATIC` | SPA aus demselben Prozess. Im Image bereits `true` | Prozess | notwendig für All-in-one | — |
| `FIREBASE_PROJECT_ID` | Firebase-Projekt | Firebase Admin | notwendig zum Start | — |
| `FIREBASE_CLIENT_EMAIL` | Service-Account | Firebase Admin | notwendig zum Start | — |
| `FIREBASE_PRIVATE_KEY` | Service-Account-PEM | Firebase Admin | notwendig zum Start | — |
| `FIREBASE_STORAGE_BUCKET` | Storage-Bucket ohne `gs://` | Firebase Admin | notwendig zum Start | — |
| `FRONTEND_URL` | Öffentliche Origin, oder stattdessen `FRONTEND_URLS` | CORS | notwendig zum Start | — |
| `FRONTEND_URLS` | Kommagetrennte Origins | CORS | alternativ zu `FRONTEND_URL` | — |
| `PUBLIC_FIREBASE_API_KEY` | Öffentlicher Web-API-Key | Firebase Auth (Browser) | notwendig wenn `SERVE_STATIC=true` | `SERVE_STATIC` |
| `PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth-Domain | Firebase Auth (Browser) | notwendig für Login | `SERVE_STATIC` |
| `PUBLIC_FIREBASE_PROJECT_ID` | Öffentliche Projekt-ID | Firebase Auth (Browser) | notwendig wenn `SERVE_STATIC=true` | `SERVE_STATIC` |
| `PUBLIC_FIREBASE_STORAGE_BUCKET` | Öffentlicher Bucket-Name | Firebase (Browser) | empfohlen | `SERVE_STATIC` |
| `PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Sender-ID | Firebase (Browser) | empfohlen | `SERVE_STATIC` |
| `PUBLIC_FIREBASE_APP_ID` | Web-App-ID | Firebase (Browser) | empfohlen | `SERVE_STATIC` |
| `OPENAI_API_KEY` | Server-Key | OpenAI | notwendig für Chat, Text, Bilder, Bildbearbeitung oder automatische Untertitel | siehe Zeilen unten |
| `NEXTER_CHAT_ENABLED` | Exakt `true` schaltet Nexter-Live-Chat frei. Default aus | OpenAI | Flag | `NEXTER_CHAT_ENABLED` |
| `TEXT_GENERATIONS_ENABLED` | Exakt `true` schaltet bezahlte Textpakete frei. Default aus | OpenAI | Flag | `TEXT_GENERATIONS_ENABLED` |
| `CAPTIONS_GENERATIONS_ENABLED` | Exakt `true` schaltet automatische Untertitel (Whisper) frei. Default aus. Ein OpenAI-Key allein reicht nicht | OpenAI | Flag | `CAPTIONS_GENERATIONS_ENABLED` |
| `IMAGE_GENERATIONS_ENABLED` | Exakt `true` schaltet Live-Bilder frei. Default aus | OpenAI oder Replicate | Flag | `IMAGE_GENERATIONS_ENABLED` |
| `IMAGE_EDITS_ENABLED` | Exakt `true` schaltet Bildbearbeitung frei. Default aus. Für V.1 aus lassen | OpenAI | Flag, optional | `IMAGE_EDITS_ENABLED` |
| `REPLICATE_API_TOKEN` | Server-Token. Schaltet nicht mehrere Features zugleich frei | Replicate | notwendig für Musik; alternativ für Bild oder Video | jeweiliges Flag |
| `VIDEO_GENERATIONS_ENABLED` | Exakt `true` schaltet KI-Video und Animation frei. Default aus | Runway oder Replicate | Flag | `VIDEO_GENERATIONS_ENABLED` |
| `RUNWAY_API_KEY` | Server-Key | Runway | alternativ zu Replicate für Video | `VIDEO_GENERATIONS_ENABLED` |
| `MUSIC_GENERATIONS_ENABLED` | Exakt `true` schaltet MusicGen frei. Default aus | Replicate | Flag | `MUSIC_GENERATIONS_ENABLED` |
| `TTS_GENERATION_ENABLED` | Exakt `true` schaltet Katalog-TTS und die ElevenLabs-Stimmenliste frei. Default aus. Browser-TTS bleibt kostenlos. Ein Key allein ruft ElevenLabs nicht auf | ElevenLabs | Flag | `TTS_GENERATION_ENABLED` |
| `ELEVENLABS_API_KEY` | Server-Key | ElevenLabs | notwendig für Katalog-TTS | `TTS_GENERATION_ENABLED` |
| `ELEVENLABS_VOICE_ID` | Optionale Default-Stimme, Provider-ID nur serverseitig | ElevenLabs | optional | `TTS_GENERATION_ENABLED` |
| `PAYMENTS_ENABLED` | Exakt `true` erlaubt neue Checkouts. Default aus | Stripe | Flag | `PAYMENTS_ENABLED` |
| `STRIPE_SECRET_KEY` | Geheimer Schlüssel | Stripe | notwendig, sobald Payments an sind | `PAYMENTS_ENABLED` |
| `STRIPE_WEBHOOK_SECRET` | Webhook-Signatur | Stripe | notwendig, sobald Payments an sind | `PAYMENTS_ENABLED` |
| `STRIPE_PRICE_STARTER` | Price-ID | Stripe | empfohlen für Live-Preise | `PAYMENTS_ENABLED` |
| `STRIPE_PRICE_PRO` | Price-ID | Stripe | empfohlen | `PAYMENTS_ENABLED` |
| `STRIPE_PRICE_ULTIMATE` | Price-ID | Stripe | empfohlen | `PAYMENTS_ENABLED` |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Öffentlicher Schlüssel, `pk_` | Stripe | notwendig für Checkout-UI | `PAYMENTS_ENABLED` |
| `PAYPAL_CLIENT_ID` | Client-ID | PayPal | optional | `PAYMENTS_ENABLED` |
| `PAYPAL_CLIENT_SECRET` | Client-Secret | PayPal | optional, notwendig wenn PayPal angeboten wird | `PAYMENTS_ENABLED` |
| `PAYPAL_MODE` | In Produktion `live`, wenn PayPal konfiguriert ist | PayPal | optional | `PAYMENTS_ENABLED` |
| `PAYPAL_WEBHOOK_ID` | Webhook-ID | PayPal | notwendig, wenn PayPal in Produktion konfiguriert ist | `PAYMENTS_ENABLED` |
| `RESEND_API_KEY` | Transaktionsmail | Resend | optional. App startet ohne | — |
| `EMAIL_FROM` | Absender auf eigener verifizierter Domain, nicht `resend.dev` | Resend | notwendig, wenn Mail gesendet werden soll | — |
| `EMAIL_REPLY_TO` | Antwortadresse | Resend | optional | — |
| `DISCORD_CLIENT_ID` | OAuth-Client | Discord | optional | — |
| `DISCORD_CLIENT_SECRET` | OAuth-Secret | Discord | optional, Paar mit der ID | — |
| `TWITCH_CLIENT_ID` | OAuth-Client | Twitch | optional | — |
| `TWITCH_CLIENT_SECRET` | OAuth-Secret | Twitch | optional, Paar mit der ID | — |
| `TIKTOK_CLIENT_ID` | OAuth-Client | TikTok | optional | — |
| `TIKTOK_CLIENT_SECRET` | OAuth-Secret | TikTok | optional, Paar mit der ID | — |
| `MICROSOFT_CLIENT_ID` | Sichtbare Client-ID. Secret nur in der Firebase Console | Microsoft / Firebase Auth | optional | — |
| `REGISTRATION_MODE` | `invite_only` (Default), `closed` oder `public` | App | optional | — |
| `DEFAULT_FREE_COINS` | Welcome-Guthaben, Default 50 | App | optional | — |
| `GENERATIONS_ENABLED` | Globaler Schalter. Nur `false` schaltet alles hart aus | App | optional | `GENERATIONS_ENABLED` |
| `DEV_AUTH_BYPASS` | Darf in Produktion nicht `true` sein. Nicht setzen | Dev | verboten in Produktion | — |

`SUNO_API_KEY` ist reserviert und schaltet nichts frei. Der inoffizielle Suno-Endpunkt bleibt aus.

Frontend-Build bei getrennter Domain: dieselben öffentlichen Firebase-Werte als `VITE_FIREBASE_*` und optional `VITE_STRIPE_PUBLISHABLE_KEY`. `VITE_API_URL` leer lassen, wenn Frontend und API dieselbe Origin haben. Keine Server-Secrets in `frontend/.env`.
