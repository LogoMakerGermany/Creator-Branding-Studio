# NEXTER Final Readiness

Stand: 25. September 2026. Kein Produktionsdeploy, keine Zahlung, kein Provider-Call, keine erfundenen Rechtsdaten.

## Fertig

- Quote → Confirm → Charge → einmaliges Refund → Idempotenz, mit Ownership-Prüfungen.
- Textgenerierung fail-closed über `TEXT_GENERATIONS_ENABLED`. Default aus. Ohne Flag keine Abbuchung und kein OpenAI-Call.
- Automatische Untertitel fail-closed über `CAPTIONS_GENERATIONS_ENABLED`. Default aus. Ein vorhandener `OPENAI_API_KEY` allein startet kein Whisper. Das Gate sitzt vor `withCoinCharge`; Whisper prüft dasselbe Flag unmittelbar vor dem Request.
- Dieselben Gates für Bild, Bildbearbeitung, Video/Animation, Musik, Katalog-TTS, Nexter-Chat und Zahlungen. Ein Secret allein schaltet das Feature nicht frei.
- Lokales FFmpeg (Video, Shorts, Thumbnails), lokales Mockup (0 Coins), Browser-TTS (0 Coins), Creator DNA, Projekte, Dateien, Layout, Kalender, Support.
- Admin-Readiness: Feature, Flag ON/OFF, Variablennamen, vorhanden JA/NEIN, READY / NOT READY. Keine Secret-Werte.
- Checkliste `NEXTER_SECRETS_CHECKLIST.md`.
- CI führt `npm test` aus.
- Rechtliche Seiten kennzeichnen sich als Entwurf und nennen fehlende Impressum-Pflichtfelder, ohne sie zu erfinden.
- Firebase-Import in `api.ts` ist statisch. Die Vite-Warnung zum gemischten Import ist im Build verschwunden.
- Whisper- und Highlight-Fehler enthalten keinen Provider-Body. Der ungenutzte inoffizielle Suno-Client ist entfernt.

## Getestet

Abschluss nach den letzten Änderungen:

- `npm run typecheck`: grün (frontend, backend, shared)
- `npm test`: 286 Suites, **1264 bestanden, 0 fehlgeschlagen**, etwa 77 s. Baseline dieses Auftrags: 1264. Davor: 1253.
- `npm run build`: grün. Die Chunk-Warnung bei etwa 1,32 MB bleibt.

Nicht ausgeführt: Playwright-E2E, Firestore-Emulator, GitHub Actions, Produktions-Smoke, echte Provider, echte Payments.

Neue Tests in diesem Schritt: `captions-gate.test.ts` (6). Davor: `text-gate.test.ts` (5), `readiness.test.ts` (3).

## Noch deaktiviert

Default aus, bis der Eigentümer Flag und Secret setzt:

- `TEXT_GENERATIONS_ENABLED`
- `CAPTIONS_GENERATIONS_ENABLED`
- `NEXTER_CHAT_ENABLED`
- `IMAGE_GENERATIONS_ENABLED`
- `IMAGE_EDITS_ENABLED`
- `VIDEO_GENERATIONS_ENABLED`
- `MUSIC_GENERATIONS_ENABLED`
- `TTS_GENERATION_ENABLED`
- `PAYMENTS_ENABLED`

Weiter zu, weil V1 das so vorsieht: Social-Publish, Voice-Cloning, inoffizielles Suno, Marketplace, Teams, Agentur, Kundenportal, White-Label, Live-Streaming.

Registrierung bleibt `invite_only`, solange niemand `public` setzt.

## Benötigte Secrets

Namen und Zuordnung: `NEXTER_SECRETS_CHECKLIST.md`.

Zum Prozessstart: Firebase-Admin, `FRONTEND_URL` oder `FRONTEND_URLS`, bei Static-Serving die öffentlichen `PUBLIC_FIREBASE_*`.

Für bezahlte Features jeweils das Flag plus den genannten Provider-Key. `DEV_AUTH_BYPASS` nicht in Produktion.

## Benötigte Accounts und Konsolen

- Firebase: Auth-Provider (E-Mail, Google, optional Microsoft), Firestore, Storage, Rules/Indexes
- OpenAI, für Chat, Text, automatische Untertitel und optional Bilder
- Replicate, für MusicGen und optional Bild oder Video
- Runway, optional für Video
- ElevenLabs, optional für Katalog-TTS
- Stripe, optional PayPal
- Resend mit verifizierter Absender-Domain
- Discord, Twitch, TikTok Developer-Konsolen, falls diese Logins an sein sollen
- Railway-Service `nexter-creator-studio`, ein Replica

## Notwendige manuelle Schritte

Stehen in `NEXTER_OWNER_ACTIONS.md`. Kurz: Betreiberadresse und Kontakt-E-Mail liefern, Rechtstexte freigeben, Secrets nur in Railway setzen, Flags einzelnd auf `true` stellen, Rules deployen, Code deployen, vor dem 1. Dezember 2026 die Railway-Config migrieren.

## Rechtliche TODOs

- Impressum: Straße, PLZ und Kontakt-E-Mail fehlen und werden als „noch nicht hinterlegt“ gezeigt. Nicht erfunden.
- AGB enthalten weiter `TODO — User Content Rights`, `Copyright/Trademark Complaints`, `AI Generated Content`, `Voice Consent`, `Commercial Use`, `Provider Terms`. Alle mit `LEGAL REVIEW REQUIRED`.
- `LEGAL_TEXT_STATUS` ist `draft`. Die Seiten sind nicht als juristisch geprüft markiert.
- Content-Rights-Klassifikation bleibt technisch und nicht rechtsverbindlich.

## Deployment-TODOs

- Diesen Stand committen und auf den Produktionsbranch bringen, dann den bestehenden Railway-Service deployen. Hier nicht geschehen.
- Firebase Rules/Indexes gegen den Live-Stand prüfen und nur bei Freigabe deployen.
- CI-Lauf auf Node 20 abwarten.
- `railway.toml` vor dem 1. Dezember 2026 migrieren. CLI im Repo ist 4.6.3 und kann das nicht.
- Replicas bei 1 lassen. Quote-Confirm-Lock und Rate-Limits sind prozesslokal.

## Bekannte Risiken

- Hauptchunk bleibt etwa 1,32 MB. Kein weiteres Splitting in diesem Lauf.
- Quote-Doppelconfirm ist bei mehr als einer Replica nicht durch eine Firestore-Transaktion abgesichert. Coin-Abbuchung selbst ist transaktional. Aktuell eine Replica.
- Signierte Download-URLs gelten bis zum TTL weiter, auch nach dem Löschen. Neue URLs werden danach nicht ausgestellt.
- Creator-DNA-Updates sind Last-Write-Wins.
- Node 20 in CI und Node 24 lokal können theoretisch auseinanderlaufen. Die Suite ist lokal grün, der Actions-Lauf steht aus.

## Finale Testzahlen

| Prüfung | Ergebnis |
| --- | --- |
| Typecheck | grün |
| Tests | 1264 bestanden, 0 fehlgeschlagen, 286 Suites |
| Build | grün |
| Gegenüber dem Stand 1253 | +11 Tests (Text-Gate, Readiness, Captions-Gate, Highlight-Gate) |
