# NEXTER Creator Studio — Master Audit

Stand: 25. September 2026. Nur Bestandsaufnahme. Kein Anwendungscode geändert, keine Secrets gelesen oder geschrieben, keine Payments, keine Provider-Aufrufe, kein Produktions-Deploy, keine Datenbank-Migration.

Geprüft: Repository-Stand lokal, `npm run typecheck`, `npm test` (Backend, Dev-Store, `NODE_TEST`), `npm run build`. Playwright-E2E (`scripts/e2e/*`) und Produktions-Smoke gegen Railway wurden nicht ausgeführt.

---

## Kurzfassung

Das Monorepo ist eine lauffähige All-in-one-Web-App (React/Vite + Express, ein Docker-Image, Firebase Auth/Firestore/Storage, Railway). Der ökonomische Kern **Quote → Confirm → Charge → Job → einmaliges Refund → Idempotenz** ist implementiert und mit 1245 Backend-Tests abgedeckt.

Produktion ist absichtlich **fail-closed**: Zahlungen aus, Live-Bild/Video/Musik/TTS/Chat aus, Registrierung `invite_only`. Der Prozess kann starten, sobald Firebase-Admin, `FRONTEND_URL(S)` und die öffentlichen Firebase-Clientwerte gesetzt sind. Ein öffentlicher Produktstart mit bezahlter KI-Generierung ist damit noch blockiert — überwiegend durch Flags, fehlende Secrets und unfertige Rechtstexte, nicht durch fehlende Studio-Pipelines.

---

## 1. Projektstruktur

| Pfad | Rolle |
| --- | --- |
| `frontend/` | React 19, Vite 6, Tailwind 4, React Router 7, Zustand, TanStack Query |
| `backend/` | Express 4, TypeScript, Firebase Admin, Stripe-SDK, Zod |
| `shared/` | Gemeinsame Typen, Coin-Preise, Creator-DNA, Studio-Schemas, Legal-Gate |
| `docs/` | Architektur, Security, Railway, Produktion |
| `Dockerfile` | Node 20 Alpine, zwei Stages, `SERVE_STATIC=true`, User `ucbs`, Healthcheck |
| `railway.toml` | Dockerfile-Builder, Health `/health`, Restart `ON_FAILURE` max 3 |
| `firestore.rules` / `storage.rules` | Client-SDK: Reads nur eigene Docs, Writes verboten |
| `.github/workflows/ci.yml` | `npm ci`, `npm run build`, `npm run typecheck` — **kein `npm test`** |

Root-Scripts: `dev`, `build`, `build:prod`, `start`, `typecheck`, `test`, `test:e2e:*`. Frontend-Lint-Script `eslint .` hat **kein ESLint in `devDependencies`**.

## 2. Frontend

Aktive Routen in `frontend/src/routes/index.tsx`: Landing, Login, OAuth-Complete, E-Mail-Verifizierung, Onboarding, Nexter-Setup, Dashboard, Projekte, Settings, Support, Coins, Nexter, Creator DNA, Logo/Banner/Facecam/Overlay/Sticker, Layout, Änderungswünsche, Prompt Studio, Video, Intro/Outro, AI-Video, AI-Voice, AI-Music, Kalender, File Cloud, Mockup, Streamset, Animation, Shorts, Social Studio, Text Studio, Templates, Admin.

Navigation (`frontend/src/v2/config/navigation.ts`) führt auf diese Studios. Geschützte Routen nutzen `ProtectedRoute`; Admin nutzt `AdminRoute`.

Legacy-Redirects: Branding, AI-Creator, AI-Assistant, Social-Media, VTuber, Magik-Settings, Mobile, Ultimate Creator, Export Center, AI-Image.

## 3. Backend

`backend/src/index.ts`: Startup-Validierung, Firebase-Init (Produktion bricht ab, wenn Admin nicht ready), Helmet/CSP, CORS-Allowlist, Rate-Limits, `/health`, `/api/v1`, optionales SPA-Static, Graceful Shutdown, Stale-Job-Recovery.

Routenmontage: `backend/src/routes/index.ts`. V1-Sperre `blockLegacyV1` (403 `FEATURE_NOT_AVAILABLE` für alle außer Admin/Super-Admin): Team, Agency, Chat, Client-Portal, Agency-Management, Marketplace, White-Label, Mobile, Live-Stream.

## 4. Shared Types/Schemas

`shared/src` ist das Vertragspaket (`@ucbs/shared`): Coins, Ledger, User/Rollen, Creator-DNA inkl. Engine, Logo/Banner/Facecam/Overlay/Sticker/Mockup/Streamset/Video/Voice/Music, Nexter, Content-Rights, Legal, Pricing. Kein eigenes Test-Script; Logik wird über Backend-Tests mit importiertem Shared geprüft. Typecheck von Shared ist grün.

## 5. Firebase / Auth / Firestore / Storage

- Auth: Firebase-ID-Token, `POST /api/v1/auth/sync`, Invite-Modus, Rollen nur serverseitig.
- Firestore: Client darf User, DNA, Projekte, Layouts **nicht** schreiben. Coin-Transaktionen, Jobs, Files, Stripe/PayPal-Idempotenz, Content-Rights: Client-Write verboten. Catch-all deny.
- Storage: `users/`, `projects/`, `exports/` — Client read/write verboten. Zugriff über Admin-SDK und kurzlebige signierte URLs.
- Ohne Firebase-Admin läuft lokal der Dev-Store. Produktion verweigert den Start und fällt nicht auf den Dev-Store zurück.
- `firebase.json` hat keine Emulator-Stanza. Echte Firestore-Transaktionsrennen sind nicht ausgeführt (im Deployment-Doc bereits so vermerkt).

## 6. Railway / Deployment

- Ein Service, Dockerfile, SPA + API, Health `GET /health`.
- `railway.toml` ist Config-as-Code. Railway stellt dieses Format für bestehende Services bis **2026-12-01** ein. CLI im Repo ist `@railway/cli` 4.6.3 und kann `railway config migrate` nicht.
- Replicas sind im Doc auf 1 festgehalten und nicht im TOML gepinnt.
- CI deployt nicht. Deploy-Scripts existieren (`railway:up`, `railway:deploy`) und wurden nicht ausgeführt.
- Vite-Build warnt: Hauptchunk ca. 1,3 MB gzip 360 KB; `firebase.ts` ist statisch und dynamisch importiert.

## 7. Creator-DNA

Vollständig im Sinne der App: Anlegen, Lesen, Aktualisieren, Version/Prompt-Kontext, Übernahme aus Logo-Konfiguration, Bindung an Projekte und Generierungen. UI: `CreatorDNAPage`. Writes nur über API. Parallele Updates sind Last-Write-Wins, ohne Versions-Lock.

## 8. Nexter-Assistent

Zweistufig:

- **Regelwerk ohne Live-Modell:** Intent, Quote-Art, Follow-ups, Studio-Öffnen, DNA-Schutz, Content-Rights-Hinweise. Das funktioniert ohne OpenAI und ist getestet.
- **Live-Chat:** nur wenn `NEXTER_CHAT_ENABLED` exakt `true` **und** `OPENAI_API_KEY` gesetzt ist (`isNexterChatProviderAvailable`). Default aus. Budget 40/60 min ist persistiert, das Inkrement-Lock ist prozesslokal.

Browser-TTS für Nexter ist kostenlos (0 Coins) und unabhängig von ElevenLabs.

## 9. Logo, Banner, Facecam, Overlay, Sticker

Pipeline vorhanden: Planung aus DNA/Payload, Ownership der Referenzdateien, Quote, `assertImageProviderReadyForStudio` **vor** Abbuchung, `withCoinCharge`, Persistenz, Refund bei Fehler.

Live-Bilder nur wenn `GENERATIONS_ENABLED` nicht `false` und `IMAGE_GENERATIONS_ENABLED` exakt `true` und (`OPENAI_API_KEY` oder `REPLICATE_API_TOKEN`). Default aus. Ein Key allein startet keine Bilder. Tests ersetzen den Provider per Hook; es gibt keinen stillen Produktions-Mock.

Bildbearbeitung (`IMAGE_EDIT`) ist ein separates Fail-closed-Flag `IMAGE_EDITS_ENABLED` und braucht OpenAI, nicht Replicate. Default aus. Im Env-Beispiel ausdrücklich nicht für V.1 aktivieren.

## 10. Video / Animation

- **Video Studio / Shorts:** lokales FFmpeg (`ffmpeg-static`): Trim, Crop, Export, Thumbnails aus dem eigenen Video. Kein Thumbnail-Call an OpenAI/Replicate. Getestet inkl. FFmpeg-Roundtrip.
- **KI-Video und Animation (Intro/Outro/Loop/Stinger):** brauchen `VIDEO_GENERATIONS_ENABLED=true` plus `RUNWAY_API_KEY` oder `REPLICATE_API_TOKEN`. Default aus. Abbuchung erst nach dem Gate. Runway-Adapter in `backend/src/lib/runway-video.ts`.
- Live-Streaming, RTMP, HLS: Route und UI für V1 gesperrt. HLS-Demo-URL existiert nur außerhalb Produktion.

## 11. Audio / Musik / TTS

- Musik: Replicate MusicGen, nur mit `MUSIC_GENERATIONS_ENABLED=true` und `REPLICATE_API_TOKEN`. Ein Replicate-Token schaltet Bild, Musik und Video nicht gemeinsam frei.
- Inoffizielles Suno ist deaktiviert. `SUNO_API_KEY` ist für einen späteren offiziellen Adapter reserviert.
- TTS: ElevenLabs-Katalog, nur mit `TTS_GENERATION_ENABLED=true` und `ELEVENLABS_API_KEY`. Voice-Cloning ist nicht implementiert und wird vor der Abbuchung abgewiesen.
- Browser-TTS: 0 Coins.

## 12. Coin-System

`shared/src/coins.ts` definiert Kategorien und Preise. Ledger mit `balanceBefore`/`balanceAfter`, Quelle, Quote, Job, Idempotency-Key. Welcome-Coins default 50 (`DEFAULT_FREE_COINS`). Tester-Guthaben ist ein separater Admin-Grant, nicht der Welcome-Default.

Lokales Mockup-Composite: 0 Coins. Layout-Service bucht nicht über `withCoinCharge`.

Coins-UI zeigt Kauf nur, wenn `paymentsEnabled === true`.

## 13. Quote → Confirm → Charge → Job

`backend/src/services/nexter/quotes.service.ts`:

- Serverpreis, Clientpreis wird ignoriert.
- Abgelaufene Quotes (TTL default 15 Minuten).
- Ownership, Projekt- und Asset-Referenz werden beim Confirm erneut geprüft.
- Content-Rights-Ack vor Confirm.
- Status `processing` / Replay bei Doppel-Confirm: eine Abbuchung, ein Job.
- Unzureichende Coins: kein Job.
- Kinds u. a. Logo, Banner, Facecam, Overlay, Sticker, Mockup, Streamset, Animation, AI-Video, Musik, Voice, Text, Captions, Image-Edit.

Charge in `backend/src/lib/billable-job.ts`: Kapazität, Kill-Switch, Ack, dann `deductCoins` mit `idempotencyKey: charge:{id}`, dann Arbeit, dann Settle oder Refund.

## 14. Refunds

`refundOnce` / `refundBillableChargeOnce`: genau eine Erstattung pro Charge bei Throw oder `job.status === failed`. Doppel-Refund ist getestet. Provider-Fehlertexte sagen Erstattung zu und erstatten im Charge-Pfad. Stale-Job-Recovery kann unterbrochene Jobs erstatten.

## 15. Idempotenz

- Coin-Debit/Refund/Welcome: Firestore-Transaktion in Produktion, Dev-Store-Mutex in Tests.
- Stripe: `processedStripeSessions`. PayPal: `processedPayPalOrders`. Credit-Key `purchase:{provider}:{paymentId}`.
- Quote-Doppelklick: prozesslokales `withDevLock`. Bei Replicas > 1 **nicht** durch Firestore-Compare-and-Set abgesichert. Aktuell 1 Replica.
- Marketplace-Kaufkey existiert im Service, die Route ist für Creator gesperrt.

## 16. Ownership / Security

Positiv:

- API-Authentifizierung, RBAC, Admin-Audit.
- Ownership auf Projekten, Dateien, Jobs, Quotes, Assets.
- Upload: MIME-Allowlist, Größenlimit.
- Firestore/Storage deny-by-default für Client-Writes.
- Produktion verweigert `DEV_AUTH_BYPASS`.
- Logs redakten PEM, Stripe, Bearer, Resend-artige Tokens.
- Keine echten Live-Secrets im durchsuchten Quelltext (nur Platzhalter und Test-Dummies).
- Signierte Downloads nur für eigene, nicht gelöschte Dateien.

Offen, siehe Security-Probleme.

## 17. Payments

Stripe- und PayPal-Routen sind implementiert (Checkout, Webhook-Signatur, Amount, `payment_status`). `PAYMENTS_ENABLED` ist fail-closed: nur exakt `true` schaltet frei. Wenn an, verlangt der Startup `STRIPE_SECRET_KEY` (`sk_…`) und `STRIPE_WEBHOOK_SECRET` (`whsec_…`). PayPal in Produktion dann nur `PAYPAL_MODE=live` plus `PAYPAL_WEBHOOK_ID`. Default und dokumentierter Produktionsstand: aus. Dieser Audit hat keine Zahlung ausgelöst.

## 18. OAuth / Social Logins

- E-Mail/Passwort und Google über Firebase Auth.
- Discord, Twitch, TikTok: Server-Authorization-Code, Buttons bleiben „nicht verfügbar“, solange Client-ID/Secret leer sind.
- Microsoft: Firebase-Provider `microsoft.com`. Secret bleibt in der Firebase Console, nicht in dieser App. Die App kennt nur `MICROSOFT_CLIENT_ID`.
- Callbacks sind auf die Nexter-Railway-Origin dokumentiert. Keine Dummy-Werte setzen.

## 19. E-Mail-Verifizierung

`passwordProviderNeedsEmailVerification`: nur Provider `password` und `emailVerified !== true`. OAuth-Provider sind ausgenommen. Geschützte API blockt unverifizierte Passwort-Konten, mit Ausnahmen für Me, Export, Account-Löschung und Resend. UI: `/verify-email`.

Transaktionsmail (Invite, Verifizierungs-Resend) läuft über Resend und ist optional. Ohne `RESEND_API_KEY` und erlaubtem `EMAIL_FROM` (eigene verifizierte Domain, nicht `resend.dev`) wird nicht stillschweigend gesendet.

## 20. Admin-Bereich

`/admin` plus `/api/v1/admin`: Settings, Invites, User, Rollen, Disable mit Selbstschutz, Coin-Anpassungen, Tester-Grant, Jobs, Stale-Recovery, Feedback, Content-Rights-Reports inkl. Takedown, Audit-Log, Systemstatus ohne Secret-Werte. Änderungen schreiben Admin-Audit. Rollenschutz ist getestet.

## 21. Tests

- Backend: 282 Suites, **1245 bestanden, 0 fehlgeschlagen**, Laufzeit ca. 86 s (`tsx --test --test-concurrency=1`). Dev-Store `ucbs-dev-store-${pid}`. Bezahlte Provider-Calls sind in Tests blockiert (`isPaidProviderTestBlocked`).
- Shared: nur Typecheck.
- Frontend: **keine** Unit-/Component-Tests.
- Playwright-E2E: Skripte für Phasen B–J vorhanden, in diesem Audit **nicht** gelaufen (brauchen laufenden Vite+API-Stack).
- CI führt die Backend-Tests nicht aus.
- Firestore-Emulator-Nebenläufigkeit: nicht gelaufen.

## 22. TypeScript

`npm run typecheck` für frontend, backend und shared: Exit 0. Backend-Build ist `tsc`. Frontend-Build ist `tsc -b` plus Vite.

## 23. Build

`npm run build`: Shared, Backend, Frontend erfolgreich (ca. 23 s). Vite-Warnung Chunk > 500 kB und gemischter Firebase-Import. Kein Build-Abbruch.

## 24. TODO / FIXME / Mocks / Stubs / Placeholder

- Rechtstexte: mehrere Absätze `TODO — … LEGAL REVIEW REQUIRED` in `backend/src/services/legal.service.ts` (User Content, Copyright, AI Content, Voice Consent, Commercial Use, Provider Terms).
- `LEGAL_TEXT_STATUS = 'draft'`. Publish-Gate bleibt zu, solange Pflichtdaten fehlen.
- Impressum: Name, Firma, Stadt, Land gesetzt. **Straße, PLZ, Kontakt-E-Mail leer** (Anzeige „noch nicht hinterlegt“). USt-Id und Register sind optional und leer. Keine erfundenen Werte.
- Provider-Mocks existieren nur als Testhooks, nicht als Produktions-Fallback.
- Dev-Store ist Dev-only.
- HLS-Demo-URL nur außerhalb Produktion.

## 25. Nicht nutzbare API-Routen

Montiert, für Creator/Tester gesperrt (`FEATURE_NOT_AVAILABLE`):

`/team`, `/agency`, `/chat`, `/client`, `/agency-management`, `/marketplace`, `/white-label`, `/mobile`, `/live-stream`.

Admin/Super-Admin kommen durch. Das ist V1-Schnitt, kein toter Router.

Sozialer Publish: Service setzt `publishingAvailable: false`. Posts bleiben Entwurf/`ready`, kein Auto-Publish.

## 26. Nicht angeschlossene UI

`LEGACY_UNAVAILABLE_PATHS`: Marketplace, Team-Chat, Team-DNA, Teams, Agency-DNA, Agency-Management, Client-Portal, White-Label, Live-Streaming → `LegacyUnavailablePage`.

Weiterhin im Tree, aber nicht als aktive Route: u. a. `MarketplacePage`, `TeamChatPage`, `TeamDNAPage`, `AgencyDNAPage`, `AgencyManagementPage`, `ClientPortalPage`, `WhiteLabelPage`, `LiveStreamingPage`, `VTuberStudioPage`, `BrandingGeneratorPage`, `AIAssistantPage`, `AIImagePage`, `UltimateCreatorPage`, `ExportCenterPage`, `MobileAppPage`, `SocialMediaPage`, `MagikAssistantSettingsPage`, `DashboardPage`, `ModulePage`. Redirects zeigen auf die V1-Flächen.

## 27. ENV und benötigte Secrets

**Pflicht, damit Produktion startet** (Werte nur in Railway / lokaler `.env`, nie im Repo):

- `NODE_ENV=production`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`
- `FRONTEND_URL` oder `FRONTEND_URLS`
- bei `SERVE_STATIC=true`: `PUBLIC_FIREBASE_API_KEY` und `PUBLIC_FIREBASE_PROJECT_ID` (plus Domain, Bucket, Sender, App-ID für den Client)

**Fail-closed, nicht startkritisch:**

| Fähigkeit | Flag (exakt `true`) | Secret |
| --- | --- | --- |
| Nexter-Live-Chat | `NEXTER_CHAT_ENABLED` | `OPENAI_API_KEY` |
| Live-Bilder | `IMAGE_GENERATIONS_ENABLED` | `OPENAI_API_KEY` und/oder `REPLICATE_API_TOKEN` |
| Bildbearbeitung | `IMAGE_EDITS_ENABLED` | `OPENAI_API_KEY` |
| KI-Video / Animation | `VIDEO_GENERATIONS_ENABLED` | `RUNWAY_API_KEY` und/oder `REPLICATE_API_TOKEN` |
| Musik | `MUSIC_GENERATIONS_ENABLED` | `REPLICATE_API_TOKEN` (nicht Suno) |
| Katalog-TTS | `TTS_GENERATION_ENABLED` | `ELEVENLABS_API_KEY` |
| Zahlungen | `PAYMENTS_ENABLED` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, Price-IDs, `PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| PayPal | nur wenn Payments an und PayPal konfiguriert | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=live`, `PAYPAL_WEBHOOK_ID` |
| Transaktionsmail | — | `RESEND_API_KEY`, `EMAIL_FROM` auf eigener Domain, optional `EMAIL_REPLY_TO` |
| Discord / Twitch / TikTok | — | jeweilige `CLIENT_ID` + `CLIENT_SECRET` |
| Microsoft | — | `MICROSOFT_CLIENT_ID` in der App; Secret nur Firebase Console |
| Google / E-Mail | — | Firebase Web-Config (`PUBLIC_FIREBASE_*` bzw. `VITE_FIREBASE_*`) |

**Niemals in Produktion:** `DEV_AUTH_BYPASS=true`.

`GENERATIONS_ENABLED` default an (nur `false` schaltet global aus). Die fachlichen Flags bleiben trotzdem zu.

## 28. Produktions- / Launch-Blocker

Der Container-Start ist code-seitig abgesichert und laut `docs/production-deployment.md` bereits als Closed Beta gedacht (Payments aus, Invite-only, Provider aus). Ein öffentlicher Launch mit bezahlter Generierung ist blockiert durch:

1. Live-Bild, Video, Musik, TTS und Nexter-Chat sind aus.
2. Zahlungen sind aus. Nutzer können Coins nicht kaufen.
3. Rechtstexte sind Entwürfe. Impressum ohne Straße, PLZ und Kontakt-E-Mail. AGB enthalten ausdrückliche Legal-TODOs.
4. Registrierung default `invite_only`.
5. Transaktionsmail und Social-Logins brauchen Secrets, die hier nicht vorliegen und nicht verlangt werden.
6. Railway-Config-as-Code läuft am 1. Dezember 2026 aus.

## 29. Security-Probleme

Kein Exploit-Write-up. Konkrete Lücken:

1. **Text-Studio umgeht den Chat-Kill-Switch.** `text.service.ts` ruft `https://api.openai.com/v1/chat/completions` auf, sobald `OPENAI_API_KEY` gesetzt ist und `GENERATIONS_ENABLED` nicht `false` ist. `NEXTER_CHAT_ENABLED` wird nicht geprüft. Ein hinterlegter Key kann kosten, obwohl Chat und Bilder aus sind. Tests blocken den echten Fetch.
2. **Quote-Confirm und Rate-Limits sind prozesslokal.** Bei einer Replica unkritisch. Ein zweites Replica kann Doppel-Confirm und Chat-Budget umgehen. Coin-Debit selbst ist transaktional.
3. **Signierte Download-URLs** bleiben bis TTL gültig, auch nach Delete. Neue URLs werden danach nicht mehr ausgestellt.
4. **Creator-DNA** ohne Versions-Lock (Last-Write-Wins).
5. **Rechtstexte** dürfen nicht als finale AGB/Impressum gelten.
6. Voice-Cloning und Social-Publish sind geschlossen. Das ist korrekt, solange die UI das nicht als verfügbar verkauft.

Firestore-Regeln und der Produktions-Bypass-Schutz sind in gutem Zustand.

## 30. Dead Code und unfertige Features

Unfertig bewusst:

- Marketplace, Teams, Agentur, Kundenportal, White-Label, Live-Streaming.
- Social-Publish.
- Voice-Cloning.
- Offizielles Suno.
- Bildbearbeitung für V.1 aus.
- Legal-Entwürfe.

Dead / nur noch im Bundle, weil importierte Seiten oder unreferenzierte Legacy-Pages existieren: siehe Abschnitt 26. Nicht löschen, bevor eine Phase die Imports prüft. Kein blinder Großumbau in diesem Audit.

---

## Was vollständig funktioniert

Lokal und in Tests, ohne externe Secrets:

- Prozess, Health, statische SPA, Produktions-Startup-Gate.
- Invite-Registrierung, Firebase-Sync, Passwort-Verifizierung, Dev-Login in Produktion gesperrt.
- Creator DNA, Projekte, File Cloud, Layout, Kalender, Support/Feedback, Templates, Onboarding.
- Nexter-Regelwerk (Quotes, Intents, Rechte-Hinweise) ohne Live-GPT.
- Quote/Confirm/Charge/Refund/Idempotenz gegen den Dev-Store.
- Lokales Mockup-Composite (0 Coins).
- Lokales FFmpeg-Video/Shorts/Thumbnails.
- Browser-TTS ohne Coins.
- Admin-Fläche und Audit.
- Ownership, RBAC, Firestore/Storage-Regeln im Repo.
- Content-Rights-Klassifikation als technische Sperre, nicht als Rechtsgutachten.
- Coins-UI bei ausgeschalteten Payments ohne Checkout.

## Was teilweise funktioniert

- Logo, Banner, Facecam, Overlay, Sticker, Lifestyle-Mockup, Streamset: Code und Tests vollständig, Live-Provider aus.
- Animation und KI-Video: Code vollständig, Provider aus. Lokales FFmpeg ersetzt die KI-Animation nicht.
- Musik und Katalog-TTS: Adapter da, Flags aus.
- Nexter-Chat: Regeln an, Modell aus.
- Text-Studio: fertig, aber an den OpenAI-Key gekoppelt ohne eigenes Flag.
- OAuth: Code da, Provider-Secrets leer → Buttons aus.
- E-Mail: Code da, Versand aus ohne Resend.
- Payments: Code da, Kill-Switch aus.
- Social Studio: Entwürfe ja, Veröffentlichen nein.
- Automatische Untertitel: kein freier Speech-Provider; bestätigte Caption-Quotes in Tests nur über Mock. FFmpeg brennt geprüfte Captions lokal ein.
- Impressum/Datenschutz/AGB: Seiten rendern als Entwurf mit Lücken.

## Was nur Mock / Stub / Placeholder ist

- Testhooks (`result: success|fail|timeout`) in Studio-Services. Nicht in Produktion.
- Dev-Store statt Firestore, nur wenn kein Firebase-Admin und nicht Produktion.
- AGB-Absätze mit `TODO` und `LEGAL REVIEW REQUIRED`.
- Leere Impressum-Pflichtfelder.
- HLS-Demo außerhalb Produktion.
- Legacy-Seiten, die auf „nicht verfügbar“ zeigen.

## Was fehlt

- Eigenes Fail-closed-Flag für Textgenerierung, analog zu Chat/Bild/Video.
- Finale Rechtstexte und fehlende Betreiberdaten (dürfen nicht erfunden werden).
- Offizieller Suno-Adapter, Voice-Cloning, Social-Publish, Marketplace, Teams, Agentur, White-Label, Live-Streaming — soweit als Produkt gewünscht.
- Frontend-Tests und CI-Ausführung von `npm test`.
- Firestore-Compare-and-Set für Quote-Confirm, falls Replicas > 1.
- Migration `railway.toml` → `.railway/railway.ts` vor dem 1. Dezember 2026.
- ESLint-Abhängigkeit oder Entfernen des toten Lint-Scripts.

## Fehler

Keine Typecheck-, Test- oder Build-Fehler in diesem Lauf.

Build-Warnungen, kein Fehler:

- JS-Chunk über 500 kB (`frontend` Hauptbundle ca. 1,3 MB).
- `frontend/src/lib/firebase.ts` gleichzeitig statisch und dynamisch importiert.

## Fehlende Tests

- Gesamtes Frontend (Komponenten, Router, Coins- und Quote-UI).
- Playwright-E2E nicht in CI und hier nicht ausgeführt.
- Kein Firestore-Emulator-Race für Debit/Refund/Invite.
- CI baut und typecheckt, führt `npm test` nicht aus.
- Kein Test, der die Text-Route ohne `NEXTER_CHAT_ENABLED` als harten Fehlschlag gegen einen gesetzten Key festschreibt (der Key-Pfad ist in Tests generell geblockt).

## Fehlende Secrets

Nicht angefordert und nicht geprüft, ob sie in Railway stehen. Für einen bezahlten Live-Betrieb fehlen dem Code nach mindestens die Flags plus:

Firebase-Admin und öffentliche Web-Config (Start), danach je Feature OpenAI, Replicate, Runway, ElevenLabs, Stripe (und optional PayPal), Resend, Discord/Twitch/TikTok-Client-Secrets. Microsoft-Secret nur in der Firebase Console.

## Security-Probleme

Siehe Abschnitt 29. Höchste Code-Lücke: Textgenerierung kann OpenAI aufrufen, ohne das Chat-Flag.

## Deployment-Probleme

- CI testet nicht.
- `railway.toml` verfällt am 1. Dezember 2026; gepinnte CLI kann nicht migrieren.
- Rate-Limits und Quote-Locks sind nicht multi-instance.
- Großes Frontend-Bundle.
- Firebase Rules/Indexes werden separat deployt (`npm run deploy:firebase:*`). Ob der Live-Stand dem Repo entspricht, wurde nicht geprüft.

## Launch-Blocker

P0 für einen öffentlichen Produktstart, nicht für den bloßen Container-Boot:

1. Bezahlte Bildgenerierung aus.
2. Bezahlte Video-/Animationsgenerierung aus.
3. Musik und Provider-TTS aus.
4. Nexter-Live-Chat aus.
5. Zahlungen aus.
6. Rechtstexte Entwurf, Impressum unvollständig, AGB-TODOs.
7. Text-Pfad ist nicht dasselbe Fail-closed-Muster wie die anderen KI-Features (Kostenrisiko, sobald ein OpenAI-Key liegt).

Invite-only und leere OAuth-Secrets blockieren einen offenen Self-Serve-Start, sind für eine geschlossene Beta aber der vorgesehene Zustand.
