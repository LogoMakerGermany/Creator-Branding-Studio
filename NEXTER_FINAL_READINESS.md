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
- Alle fünf Rechtstext-Seiten sind öffentlich eingebunden und als Entwurf gekennzeichnet. Impressumsangaben verwenden bis zur Veröffentlichung ausschließlich klar markierte Platzhalter.
- Firebase-Import in `api.ts` ist statisch. Die Vite-Warnung zum gemischten Import ist im Build verschwunden.
- Whisper- und Highlight-Fehler enthalten keinen Provider-Body. Der ungenutzte inoffizielle Suno-Client ist entfernt.
- Die ElevenLabs-Stimmenliste bleibt aus, solange `TTS_GENERATION_ENABLED` nicht exakt `true` ist. Ein Key allein ruft sie nicht ab.

## Getestet

Abschluss nach den letzten Änderungen:

- `npm run typecheck`: grün (frontend, backend, shared)
- `npm test`: 286 Suites, **1265 bestanden, 0 fehlgeschlagen**. Baseline davor: 1264.
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

Stehen in `NEXTER_OWNER_ACTIONS.md`. Kurz: echte Betreiberangaben erst vor Veröffentlichung liefern, Rechtstexte freigeben, bezahlte Provider für den ersten Test aus lassen, Code kontrolliert deployen und vor dem 1. Dezember 2026 die Railway-Config migrieren.

## Rechtliche TODOs

- Impressum: Betreibername, Straße/Hausnummer, PLZ/Ort und Kontakt-E-Mail bleiben bis zur Veröffentlichung als `[BETREIBER_NAME]`, `[STRASSE_HAUSNUMMER]`, `[PLZ_ORT]` und `[KONTAKT_EMAIL]` markiert. Nicht erfunden.
- AGB enthalten weiter `TODO — User Content Rights`, `Copyright/Trademark Complaints`, `AI Generated Content`, `Voice Consent`, `Commercial Use`, `Provider Terms`. Alle mit `LEGAL REVIEW REQUIRED`.
- `LEGAL_TEXT_STATUS` ist `draft`. Die Seiten sind nicht als juristisch geprüft markiert.
- Content-Rights-Klassifikation bleibt technisch und nicht rechtsverbindlich.

## Railway-Befund, nicht von hier geändert

In Produktion stehen `IMAGE_GENERATIONS_ENABLED`, `IMAGE_EDITS_ENABLED`, `NEXTER_CHAT_ENABLED` und `VIDEO_GENERATIONS_ENABLED` auf `true`. `PAYMENTS_ENABLED` ist `false`. `REGISTRATION_MODE` ist `invite_only`. `DEV_AUTH_BYPASS` fehlt. `OPENAI_API_KEY` und `RUNWAY_API_KEY` sind vorhanden, `REPLICATE_API_TOKEN` fehlt. Die Startnamen `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`, `FRONTEND_URL`, `FRONTEND_URLS`, `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID` und `PUBLIC_FIREBASE_APP_ID` sind vorhanden. Werte wurden nicht angezeigt. Diese Flags werden nicht aus diesem Lauf gespeichert, weil Speichern einen Rebuild auslösen kann. Der kontrollierte Schritt steht in `NEXTER_OWNER_ACTIONS.md`.

## Deployment-TODOs

- Diesen Stand committen und auf den Produktionsbranch bringen, dann den bestehenden Railway-Service deployen. Hier nicht geschehen.
- Firebase-Production-Schritt abgeschlossen: `content_rights_reports` ist live und fail-closed; der Composite-Index `oauth_identities` auf `firebaseUid` und `createdAt` ist READY. Die bestehenden 42 Composite-Indexes sind unverändert READY. Storage-Rules blieben unverändert.
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
| Tests | 1265 bestanden, 0 fehlgeschlagen, 286 Suites |
| Build | grün |
| Gegenüber dem Stand 1253 | +11 Tests (Text-Gate, Readiness, Captions-Gate, Highlight-Gate) |
