# Production Migration — Demo/Mock → Produktiv

Stufenplan für UCBS. **Nicht alles auf einmal** — jede Etappe testen, dann weiter.

| Etappe | Bereich | Spec-Abschnitte | Status |
|--------|---------|-----------------|--------|
| **1** | Branding | Logo, Banner, Facecam, Overlay, Sticker, Branding Pack, DNA | ✅ Abgeschlossen |
| **2** | Video | Video Studio, Intro/Outro, VTuber, KI Media | ✅ Abgeschlossen |
| **3** | Auth | Firebase, OAuth (Google, Discord, Twitch, TikTok, GitHub, Apple, MS) | ✅ Abgeschlossen |
| **4** | Payments | Stripe, PayPal, Coins, Webhooks | ✅ Abgeschlossen |
| **5** | Marketplace | Seed-Daten entfernen, echte Listings | ✅ Abgeschlossen |
| **6** | Rest | Social, Assistant, Calendar, Chat, File Cloud | ✅ Abgeschlossen |

## Etappe 1 — Checkliste

- [x] Audit Demo/Mock/Placeholder
- [x] `dev-placeholder` Bilder entfernen (nur echte KI oder Fehler)
- [x] Logo Generator: alle Eingabefelder + Export PNG/SVG/HD + Job-Historie
- [x] Banner: Plattform-Größen (Twitch, YouTube, TikTok, …) + Historie
- [x] Facecam Studio: Formen, Stile, Export + Historie
- [x] Overlay Studio: HUD, Alerts, Panels, Szenen + Historie
- [x] Sticker Studio: Emotes, Formen, PNG/SVG + Historie
- [x] Branding Pack: produktive Prompts, Partial-Failure-Handling, Export-Links
- [x] Studio GET: echte Job-Historie statt `projects: []`
- [x] DNA-Analyse: OpenAI Vision (`gpt-4o-mini`) + Farb-Heuristik-Fallback
- [x] Tote Mock-Funktionen gelöscht (`generateDevPlaceholderSvg`)
- [x] Static Tests: `node scripts/test-etappe1.mjs`

## Etappe 2 — Checkliste

- [x] Video-Analyse-Fallback entfernen (`buildFallbackVideoAnalysis`)
- [x] Whisper-Transkription für echte Untertitel aus hochgeladenem Video
- [x] Highlights aus Transkript (GPT), nicht aus Platzhalter-Heuristik
- [x] Shorts: FFmpeg-Clip aus Quellvideo (9:16), nicht neue KI-Videos
- [x] Video Studio: Render mit eingebrannten Untertiteln + SRT-Export
- [x] Intro/Outro: MP4 + GIF + WEBM Exporte nach Generierung
- [x] KI Musik: Genre/BPM-Metadaten, korrekte Provider-Hinweise
- [x] VTuber: ehrliche PNG-only Export-Angabe
- [x] Static Tests: `node scripts/test-etappe2.mjs`

### Etappe 2 — API Keys

| Feature | Env-Variable |
|---------|--------------|
| Untertitel / Highlights | `OPENAI_API_KEY` (Whisper + GPT) |
| Intro/Outro / KI Video | `RUNWAY_API_KEY` oder `REPLICATE_API_TOKEN` |
| KI Musik | `REPLICATE_API_TOKEN` oder `SUNO_API_KEY` |
| KI Stimme | `ELEVENLABS_API_KEY` |
| Video-Clips / Render | `ffmpeg-static` (automatisch via npm) |

## Etappe 3 — Checkliste

- [x] Alle OAuth-Provider in Login UI (Google, GitHub, Apple, Microsoft, Discord, Twitch, TikTok)
- [x] Firebase Auth Provider-Mapping (`resolveAuthProvider`)
- [x] Backend `/auth/sync` validiert Provider-Enum
- [x] Bestehende User: `authProviders` werden beim Login gemerged
- [x] `scripts/sync-firebase-env.mjs` — Firebase Web Config → `.env.production` / `.env.railway`
- [x] Setup-Doku: `docs/ETAPPE3-AUTH-SETUP.md`
- [x] Static Tests: `node scripts/test-etappe3.mjs`
- [ ] Firebase Console: OIDC Provider manuell aktivieren (Discord/Twitch/TikTok)
- [ ] Service Account in Railway + authorized domains

## Etappe 4 — Checkliste

- [x] Coin-Pakete zentral in `@ucbs/shared` (`coin-packages.ts`)
- [x] Stripe Checkout + Webhook (`checkout.session.completed` + async)
- [x] Stripe Idempotenz (`processedStripeSessions`) + Betragsvalidierung
- [x] PayPal Checkout + Capture + Webhook-Signaturprüfung
- [x] PayPal Idempotenz (`processedPayPalOrders`)
- [x] Transaktionen mit Provider-Metadaten (`stripeSessionId` / `paypalOrderId`)
- [x] Dev-Purchase Endpoints production-guarded (Backend + Frontend)
- [x] Startup-Validierung: Stripe Pflicht, PayPal live + Webhook ID wenn aktiv
- [x] Setup-Doku: `docs/ETAPPE4-PAYMENTS-SETUP.md`
- [x] Static Tests: `node scripts/test-etappe4.mjs`

## Etappe 5 — Marketplace

- [x] `seedMarketplace()` nur in Dev (`seedMarketplaceDev` + `isProduction()` Guard)
- [x] `placeholderSvg()` entfernt — echte Uploads via Firebase Storage
- [x] Frontend: Vorschau + Asset Upload auf Verkaufen-Tab
- [x] Test: `scripts/test-etappe5.mjs`
- [x] Doku: `docs/ETAPPE5-MARKETPLACE-SETUP.md`

## Etappe 6 — Rest (Social, Assistant, Calendar, Chat, File Cloud)

- [x] Social: Fake-Engagement entfernt, Medien-Upload, Kalender-Sync bei Planung
- [x] Assistant: Production erfordert OPENAI_API_KEY, Dev-Fallback nur lokal
- [x] Calendar: Datumsvalidierung + ServiceError
- [x] Chat: Dev-only Welcome, Team-Name im Kanal
- [x] File Cloud: Video/Sticker-Validierung, Bildvorschau
- [x] Test: `scripts/test-etappe6.mjs`
- [x] Doku: `docs/ETAPPE6-REST-SETUP.md`

## Dev-only (bleibt, Guards prüfen)

- `dev-login`, `dev-purchase`, `dev-store` — nur wenn `!isProduction()`

## Abschlussprüfung (nach Etappe 6)

Siehe User-Spec §21: jede Seite, jeder Button, jede API, Railway/Docker Build.
