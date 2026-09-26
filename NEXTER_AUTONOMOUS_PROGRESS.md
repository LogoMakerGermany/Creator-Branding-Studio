# NEXTER Autonomous Progress

Stand: 25. September 2026. Baseline davor: Typecheck grün, 1245 Tests grün, Build grün.

Abschluss dieses Laufs: Typecheck grün, **1265 Tests grün, 0 fehlgeschlagen**, 286 Suites, Build grün.

---

## Phase A — TEXT_GENERATIONS_ENABLED

- Datum: 25. September 2026
- Änderung: Bezahlte Textpakete laufen nur, wenn `TEXT_GENERATIONS_ENABLED` exakt `true` ist und `GENERATIONS_ENABLED` nicht `false` ist. Ohne Flag oder ohne `OPENAI_API_KEY`: kein OpenAI-Call, keine Coin-Abbuchung, kein Text-Job. Test-Mocks über `setTextTestHooks` bleiben der bestehende Adapter und rufen OpenAI nicht auf. In `NODE_TEST` blockt `isPaidProviderTestBlocked` auch bei Flag und Key vor der Abbuchung.
- Dateien: `backend/src/config/env.ts`, `backend/src/services/text-provider-gate.ts`, `backend/src/services/text.service.ts`, `backend/src/routes/status.routes.ts`, `backend/.env.example`, `backend/.env.railway.example`, `docs/production-deployment.md`, `backend/package.json`, `frontend/src/services/api.ts`
- Neue Tests: `backend/src/services/text-gate.test.ts`. `content.phase-g.test.ts` erwartet den neuen Code `TEXT_GENERATION_DISABLED`, weil das der beabsichtigte Zustand ohne Flag ist. Die Reihenfolge „Gate vor `withCoinCharge`“ bleibt assertiert.
- Testergebnis: zuerst die neuen Fälle grün, danach volle Suite 1250/1250
- Typecheck: grün
- Build: grün
- Verbleibend: Flag und Key muss der Eigentümer später selbst setzen. Default bleibt aus.

## Phase B — Rechtstexte als Entwurf sichtbar

- Datum: 25. September 2026
- Änderung: keine. `LegalPage` zeigt bei `publicationStatus !== published` den Entwurfshinweis. Impressum nennt fehlende Straße, PLZ und E-Mail als „noch nicht hinterlegt“. Das Publish-Gate wird mit den leeren Pflichtfeldern nicht `published`.
- Dateien: keine
- Tests: bereits in `legal-pages-workflow.test.ts` und `legal-operator-e2e.test.ts`, in der vollen Suite enthalten
- Testergebnis: grün im Abschluss-Lauf
- Typecheck: grün
- Build: grün
- Verbleibend: keine juristischen Formulierungen ergänzt

## Phase C — Betreiberdaten

- Datum: 25. September 2026
- Nicht ausgeführt. Straße, PLZ und Kontakt-E-Mail dürfen nicht erfunden werden.
- Verbleibend: siehe `NEXTER_OWNER_ACTIONS.md`

## Phase D — AGB-TODOs ersetzen

- Datum: 25. September 2026
- Nicht ausgeführt. Es liegt keine juristische Vorlage vor. Die sechs `TODO — … LEGAL REVIEW REQUIRED` Absätze bleiben.
- Verbleibend: siehe `NEXTER_OWNER_ACTIONS.md`

## Phase E — Readiness ohne Aktivierung

- Datum: 25. September 2026
- Änderung: `buildReadinessReport()` liefert Feature, Flag-Name, ON/OFF bzw. n/a, Variablennamen, vorhanden JA/NEIN, `READY` / `NOT READY`. Keine Werte, keine Längen, kein Live-Ping. Öffentliches `/api/v1/status` enthält den Report nicht. Admin-Übersicht und `GET /api/v1/admin/readiness` schon. Die Admin-Diagnose zeigt die Zeilen.
- Dateien: `backend/src/services/readiness.service.ts`, `backend/src/services/readiness.test.ts`, `backend/src/services/admin.service.ts`, `backend/src/routes/admin.routes.ts`, `backend/src/config/env.ts` (`isConfiguredVariablePresent`, Allowlist), `frontend/src/services/api.ts`, `frontend/src/pages/admin/AdminPage.tsx`, `NEXTER_SECRETS_CHECKLIST.md`
- Tests: Report enthält einen gesetzten Platzhalter-Key nicht. Bild ist READY, wenn das Flag an ist und nur Replicate gesetzt ist. Text ohne Key bleibt NOT READY. Discord-ID und Secret werden getrennt gemeldet.
- Testergebnis: 3 neue Tests, volle Suite danach 1253/1253
- Typecheck: grün
- Build: grün
- Verbleibend: die tatsächlichen Werte trägt der Eigentümer in Railway ein

## Phase F — Bild-Pipeline

- Datum: 25. September 2026
- Änderung: keine. Logo, Banner, Facecam, Overlay, Sticker, Lifestyle-Mockup und Streamset prüfen den Image-Provider vor der Abbuchung. Flag default aus.
- Tests: bestehende Image- und Streamset-Suites im Abschluss-Lauf grün
- Verbleibend: Live-Bilder bleiben aus, bis Flag und Secret gesetzt sind

## Phase G — Video, Animation, Musik, TTS

- Datum: 25. September 2026
- Änderung: keine. KI-Video, Animation, MusicGen und Katalog-TTS bleiben fail-closed. FFmpeg und Browser-TTS bleiben lokal. Voice-Clone und inoffizielles Suno bleiben zu.
- Tests: bestehende Video-, Animations-, Musik- und TTS-Suites im Abschluss-Lauf grün
- Verbleibend: Flags default aus

## Phase H — Zahlungen

- Datum: 25. September 2026
- Änderung: keine. `assertNewPaymentsAllowed` blockt neue Stripe- und PayPal-Checkouts, solange `PAYMENTS_ENABLED` nicht exakt `true` ist. Die Coins-Seite zeigt keinen Kauf.
- Tests: `payments-kill-switch.test.ts` im Abschluss-Lauf
- Verbleibend: keine Testzahlung, keine Live-Keys

## Phase I — Transaktionsmail

- Datum: 25. September 2026
- Änderung: keine. Ohne gültiges Resend-Paar wird nicht gesendet. Die App startet trotzdem.
- Tests: bestehende E-Mail-Suites im Abschluss-Lauf
- Verbleibend: Domain und Key durch den Eigentümer

## Phase J — OAuth

- Datum: 25. September 2026
- Änderung: keine. Discord, Twitch und TikTok brauchen ID und Secret, sonst kein Flow. Microsoft nur die Client-ID in der App; das Secret bleibt in Firebase.
- Tests: bestehende OAuth-Suites im Abschluss-Lauf
- Verbleibend: Provider-Konsolen

## Phase K — CI führt die Backend-Tests aus

- Datum: 25. September 2026
- Änderung: `.github/workflows/ci.yml` ruft nach dem Typecheck `npm test` auf. Keine Secrets im Workflow.
- Dateien: `.github/workflows/ci.yml`
- Tests: lokal 1253 grün. GitHub Actions wurde in diesem Lauf nicht ausgelöst.
- Typecheck: grün
- Build: grün
- Verbleibend: CI nutzt Node 20, lokal geprüft wurde Node 24. Der nächste PR zeigt, ob Node 20 abweicht.

## Frontend, Performance, P2/P3

- API-Fehlercode `TEXT_GENERATION_DISABLED` hat eine feste deutsche Meldung in `frontend/src/services/api.ts`.
- `getIdToken` wird in `api.ts` statisch importiert. Die Vite-Warnung zum gemischten Firebase-Import ist im Build weg.
- Der Hauptchunk bleibt etwa 1,32 MB. Kein manuelles Chunk-Splitting, das wäre eine größere Frontend-Struktur.
- Phasen L, N, O, P, Q (über den Import hinaus) und R sind P2/P3 und wurden nicht als Umbau gestartet. Marketplace, Teams, Agentur, White-Label, Live-Streaming und Social-Publish bleiben bewusst zu.

## Phase L — Provider-Antworten und toter Suno-Pfad

- Datum: 25. September 2026
- Änderung: Whisper- und Highlight-Fehler nennen nur noch einen festen Satz. Der Provider-Body geht nicht an den Client. Die ungenutzte Funktion `generateMusicWithSuno` samt `sunoapi.org` ist entfernt. Suno bleibt über `MUSIC_PROVIDER=suno` und einen vorhandenen Suno-Key abgelehnt.
- Dateien: `backend/src/lib/video-analysis.ts`, `backend/src/lib/media-providers.ts`, `backend/src/services/captions-gate.test.ts`, `backend/src/services/nexter/music.test.ts`, `backend/src/services/nexter-branding-e2e.test.ts`
- Testergebnis: volle Suite 1264/1264
- Typecheck: grün
- Build: grün
- Nicht angefasst: Chunk-Splitting, Railway-Migration, Replica-Lock, Rechtstexte, Feature-Flags, Deploy

## Phase M — Stimmenliste fail-closed

- Datum: 26. September 2026
- Änderung: `GET /v1/voices` läuft nur, wenn `TTS_GENERATION_ENABLED` exakt `true` ist und die globale Generierung an ist. Ein ElevenLabs-Key allein ruft die Liste nicht ab. In Tests bleibt der Live-Call blockiert. Test-Loader bleiben der Mock-Pfad. Nexter-Chat prüft `isNexterChatProviderAvailable()` unmittelbar vor dem Chat-Completion-Request.
- Prüfung 1: `voice-catalog.test.ts` und `nexter-tts-e2e.test.ts`, 38 bestanden.
- Prüfung 2: volle Suite 1265 bestanden, Typecheck grün.
- Verbleibend: Die vier in Railway auf `true` stehenden Flags werden nicht von hier geändert.

## Verbleibende Blocker

Siehe `NEXTER_OWNER_ACTIONS.md`. Lokal lösbare P0- und P1-Punkte sind erledigt. Offen sind Betreiberdaten, Rechtstexte, Secrets, Flags, Domain/DNS und die Produktionsfreigabe.
