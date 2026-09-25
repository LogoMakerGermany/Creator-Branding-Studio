# NEXTER Autonomous Plan

Stand: 25. September 2026, nach `NEXTER_MASTER_AUDIT.md`.

Regeln für jede Phase: kleine Diffs, bestehende Studios nicht neu schreiben, keine Secrets ins Repo, keine echten Provider-Calls, keine Payments, kein Produktions-Deploy, keine destruktive Migration. Flags in Produktion bleiben aus, bis eine eigene Freigabe das ausdrücklich ändert.

Priorität: **P0** verhindert öffentlichen Produktstart. **P1** Kernfunktion. **P2** wichtig. **P3** Erweiterung.

---

## Phase A — Text-Generierung fail-closed machen

**Priorität:** P0  
**Ziel:** Ein gesetzter `OPENAI_API_KEY` darf keine Text-Coins abbuchen und keinen Chat-Completion-Call auslösen, solange ein eigenes Flag nicht exakt `true` ist. Gleiches Muster wie Bild, Video, Musik, TTS und Nexter-Chat.

**Betroffene Dateien:**

- `backend/src/config/env.ts`
- `backend/src/services/text.service.ts`
- `backend/.env.example`
- `backend/.env.railway.example`
- `backend/src/services/provider-readiness-e2e.test.ts` oder ein neues `backend/src/services/text-gate.test.ts`
- `docs/production-deployment.md` (nur die Flag-Tabelle, keine Aktivierung)

**Implementierung:**

- Flag `TEXT_GENERATIONS_ENABLED`, nur exakt `true` (case-insensitive wie die bestehenden Helfer).
- `callOpenAiJson` und der Pre-Debit-Check in `generateContentPackage` prüfen das Flag **vor** `withCoinCharge`.
- Fehlender Key oder Flag aus: 503, 0 Abbuchung, 0 Fetch.
- `GENERATIONS_ENABLED=false` bleibt zusätzlich hart.
- Default in Beispielen: `false`. Nicht in `railway.toml` schreiben.
- Status-Ausgabe, falls sie Provider listet, um das Flag ergänzen, ohne Secret-Werte.

**Tests:**

- Flag fehlt / `false` / `yes` / leerer String, Key gesetzt: kein Debit, kein `fetch` zu OpenAI.
- Flag `true` und Key gesetzt: in `NODE_TEST` weiterhin durch `isPaidProviderTestBlocked` blockiert.
- Flag `true` ohne Key: `AI_NOT_CONFIGURED`, 0 Debit.
- Bestehendes `npm test` bleibt grün.

**Akzeptanz:**

- Textstudio kann Produktion nicht mehr allein über den OpenAI-Key bezahlen.
- Nexter-Chat-Flag und Bild-Flag ändern ihr Verhalten nicht.

**Risiken:** Geschlossene Beta, die Text heute nur mit Key und ohne Flag nutzt, wäre danach zu. Das ist beabsichtigt. Vorher prüfen, ob Railway den Key schon ohne Flag nutzt — nur lesen, nichts umstellen.

**Abhängigkeiten:** keine Secrets. Muss vor jeder späteren OpenAI-Freigabe fertig sein.

---

## Phase B — Rechtstexte nicht als veröffentlicht behandeln

**Priorität:** P0  
**Ziel:** Solange Impressum und AGB Entwurf sind, sieht jede öffentliche Legal-Seite den Entwurfsstatus und die fehlenden Pflichtfelder. Keine erfundenen Adressen, keine erfundenen AGB-Klauseln.

**Betroffene Dateien:**

- `shared/src/legal.ts`
- `backend/src/services/legal.service.ts`
- `frontend/src/pages/legal/LegalPage.tsx`
- `backend/src/services/legal-pages-workflow.test.ts`
- `backend/src/services/legal-operator-e2e.test.ts`

**Implementierung:**

- Nur prüfen und, falls eine Fläche den Entwurf versteckt, die bestehende Draft-Kennzeichnung sichtbar machen.
- Pflichtlücken bleiben: Straße, PLZ, Kontakt-E-Mail. USt-Id und Register nicht erfinden.
- Die sechs `TODO — … LEGAL REVIEW REQUIRED` Absätze bleiben stehen, bis ein Mensch finale Formulierungen liefert.
- Publish-Gate darf bei fehlenden Feldern nicht auf `published` springen.

**Tests:** bestehende Legal-Workflow-Tests plus ein Fall, der leere Straße/PLZ/E-Mail nicht als veröffentlicht zählt.

**Akzeptanz:** Kein Nutzer sieht einen vollständigen Impressums- oder AGB-Claim, den die Daten nicht hergeben.

**Risiken:** Juristische Formulierungen sind keine Code-Aufgabe. Diese Phase schreibt keine finalen AGB.

**Abhängigkeiten:** Phase A nicht nötig. Finale Texte blockieren auf Betreiber und Anwalt, nicht auf diese Phase.

---

## Phase C — Betreiberdaten einsetzen, ohne sie zu erfinden

**Priorität:** P0  
**Ziel:** `LEGAL_OPERATOR` enthält die vom Betreiber gelieferten Pflichtwerte. Publish-Status bleibt `draft`, bis die juristische Freigabe `final` will.

**Betroffene Dateien:** `shared/src/legal.ts`, Legal-Tests, ggf. Impressum-Blöcke in `legal.service.ts`.

**Implementierung:** Werte nur aus einer ausdrücklichen Betreiber-Vorgabe übernehmen. Leere optionale Felder leer lassen. Keine Secrets. Danach Tests auf fehlende Pflichtfelder anpassen, die dann wirklich gesetzt sind.

**Tests:** `missingLegalOperatorFields` ist für die gesetzten Pflichtfelder leer. Entwurf bleibt Entwurf, solange `LEGAL_TEXT_STATUS` `draft` ist.

**Akzeptanz:** Impressum zeigt die gelieferten Daten und keine Platzhalter für diese Felder. AGB-TODOs sind noch da, wenn Phase D nicht abgeschlossen ist.

**Risiken:** Falsche Stammdaten wären ein echter Rechtsfehler. Lieber leer lassen als raten.

**Abhängigkeiten:** Phase B. Menschliche Datenlieferung. Nicht autonom starten.

---

## Phase D — AGB-TODOs durch freigegebene Texte ersetzen

**Priorität:** P0  
**Ziel:** Die sechs TODO-Absätze zu Nutzungsrechten, Beschwerden, KI-Inhalten, Stimme, kommerzieller Nutzung und Provider-Terms werden durch den freigegebenen Wortlaut ersetzt. Keine „copyright free“-Zusage, die der Code nicht belegen kann.

**Betroffene Dateien:** `backend/src/services/legal.service.ts`, `shared/src/content-rights.ts` nur wenn der Disclaimer angepasst werden muss, Legal-Tests.

**Implementierung:** Wortlaut 1:1 aus der juristischen Vorlage. Content-Rights-Klassifikation bleibt technisch und `legallyConclusive: false`.

**Tests:** Die Strings `TODO — User Content Rights` usw. sind weg. Tests, die sie heute erwarten, werden auf den neuen Wortlaut umgestellt. Disclaimer gegen automatische Rechtefreiheit bleibt.

**Akzeptanz:** Öffentliche AGB enthalten keine `TODO`-Marker mehr. Status wird nur auf `final` gesetzt, wenn Phase C fertig ist und der Betreiber das ausdrücklich sagt.

**Risiken:** Eigenmächtig formuliertes Recht. Phase startet nicht ohne Vorlage.

**Abhängigkeiten:** Phase C und juristische Freigabe.

---

## Phase E — Readiness-Report ohne Aktivierung

**Priorität:** P1  
**Ziel:** Ein lokaler, geheimer Report sagt pro Feature „Flag fehlt / Secret-Name fehlt / beides da“, ohne Werte zu drucken und ohne Flags umzulegen.

**Betroffene Dateien:**

- `backend/src/config/env.ts` (`getPaidGenerationAvailability`, `collectProductionConfigIssues`)
- `backend/src/routes/status.routes.ts` oder Admin-Systemstatus
- `backend/src/services/provider-readiness-e2e.test.ts`
- optional `scripts/predeploy-check.mjs`

**Implementierung:**

- Öffentlicher `/api/v1/status` bleibt ohne Secret-Material und ohne „verfügbar“, wenn nur der Key da ist.
- Admin-Status zeigt boolean `configured` / `enabled` je Kanal: image, imageEdit, video, music, tts, chat, text, payments, email, discord, twitch, tiktok.
- Kein Live-Ping an OpenAI, Replicate, Runway, ElevenLabs, Stripe, Resend.

**Tests:** Matrix Flag×Key für alle Kanäle inklusive des neuen Text-Flags. Status-JSON enthält keine Key-Substrings.

**Akzeptanz:** Ein Operator kann die Closed Beta lesen, ohne eine Generation zu starten.

**Risiken:** Ein zu redseliger Status würde Konfiguration leaken. Tests müssen das verbieten.

**Abhängigkeiten:** Phase A.

---

## Phase F — Bild-Pipeline nur gegen Testadapter prüfen

**Priorität:** P1  
**Ziel:** Logo, Banner, Facecam, Overlay, Sticker, Lifestyle-Mockup und Streamset bleiben bei ausgeschaltetem Flag ohne Debit. Ein Testadapter beweist weiterhin: ein Erfolg = ein Debit und eine eigene Datei; ein Fehler = ein Refund.

**Betroffene Dateien:** bestehende `*-workflow.test.ts`, `image-generation-e2e.test.ts`, `streamset-confirm.test.ts`. Nur anfassen, wenn Phase A/E einen Vertrag gebrochen hat.

**Implementierung:** Keine neue Provider-Implementierung. Kein Live-Call. Flag-Default bleibt `false`.

**Tests:** vorhandene Image- und Streamset-Suites.

**Akzeptanz:** `npm test` grün. Produktionscode ruft bei Flag aus `throwImageGenerationUnavailable` vor `withCoinCharge`.

**Risiken:** Refactor würde funktionierende Studios gefährden. Diese Phase ist Verifikation, kein Rewrite.

**Abhängigkeiten:** Phase A, Phase E.

---

## Phase G — Video, Animation, Musik, TTS gleiche Verifikation

**Priorität:** P1  
**Ziel:** KI-Video, Animation, MusikGen und Katalog-TTS bleiben fail-closed. Lokales FFmpeg und Browser-TTS bleiben kostenlos und providerfrei. Voice-Clone bleibt vor dem Debit geschlossen. Suno-Inoffiziell bleibt aus.

**Betroffene Dateien:** `backend/src/lib/media-providers.ts`, `animation.service.ts`, `music.service.ts`, `voice.service.ts`, `ai-video` Services, zugehörige Tests. Nur bei Bruch anfassen.

**Implementierung:** keine neuen Netzzugriffe. Thumbnail bleibt lokal.

**Tests:** `video-workflow`, `video-closure`, `video-quote-e2e`, `animation-workflow`, `music-quote-e2e`, `voice-workflow`, `nexter-tts-e2e`, `provider-readiness-e2e`.

**Akzeptanz:** Flag aus = 0 Debit. Clone-Intent = 0 Debit. FFmpeg-Trim funktioniert ohne API-Key.

**Risiken:** Animation nicht versehentlich auf einen zweiten lokalen Renderer umbauen.

**Abhängigkeiten:** Phase E.

---

## Phase H — Zahlungen weiter zu, Verträge festziehen

**Priorität:** P1  
**Ziel:** Checkout bleibt unmöglich, solange `PAYMENTS_ENABLED` nicht exakt `true` ist. Webhook-Idempotenz und Betragsprüfung bleiben. Kein Testkauf.

**Betroffene Dateien:** `backend/src/routes/stripe.routes.ts`, `paypal.routes.ts`, `payment-credit.service.ts`, `payments-kill-switch.test.ts`, `frontend/src/pages/coins/CoinsPage.tsx`.

**Implementierung:** Nur Lücken schließen, die ein Test zeigt (zum Beispiel Checkout-Button sichtbar trotz Flag aus). Keine Price-IDs committen. Keine Webhook-Secrets.

**Tests:** Kill-Switch-Suite. Frontend bleibt ohne Unit-Test; mindestens ein Backend-Test, der die Coins-Page-Quelle auf `paymentsEnabled === true` prüft, falls noch nicht vorhanden.

**Akzeptanz:** Flag aus: kein Session-Create, UI ohne Kauf. Flag an ohne Stripe-Secret: Prozess startet in Produktion nicht (bestehendes Startup-Gate).

**Risiken:** Ein echter `sk_live` im Test wäre ein Sicherheitsvorfall. Tests nutzen weiter Dummy-Präfixe, die der Secret-Scan ablehnt, oder gar keine Key-Strings.

**Abhängigkeiten:** keine. Operator setzt Stripe später selbst in Railway.

---

## Phase I — Transaktionsmail fail-closed lassen

**Priorität:** P1  
**Ziel:** Invite- und Verifizierungsmails scheitern sauber ohne Resend, ohne den Login zu zerlegen. From-Adresse bleibt auf eine eigene Domain beschränkt.

**Betroffene Dateien:** `backend/src/services/email.service.ts`, `email-address.ts`, `email-resend-readiness.test.ts`, `email-production-e2e.test.ts`.

**Implementierung:** Kein neuer Provider. Kein `resend.dev` als Produktions-From. Keine Empfänger aus diesem Plan anschreiben.

**Tests:** bestehende E-Mail-Suites. Ein Fall: Key ohne gültiges `EMAIL_FROM` sendet nicht.

**Akzeptanz:** App startet ohne Resend. Passwort-Verifizierung blockt die API weiter, auch wenn der Resend fehlschlägt; der Nutzer sieht einen nachvollziehbaren Hinweis.

**Risiken:** Invite-only ohne Mail zwingt Admins, Codes manuell zu geben. Das ist akzeptabel und schon der Fall.

**Abhängigkeiten:** keine Secrets in der Phase. Echte Domain-Verifizierung ist Operator-Arbeit danach.

---

## Phase J — OAuth bleibt dunkel ohne Secrets

**Priorität:** P1  
**Ziel:** Discord, Twitch, TikTok und Microsoft starten keinen Flow mit leeren oder Dummy-Werten. Google und E-Mail/Passwort bleiben über Firebase.

**Betroffene Dateien:** `backend/src/routes/oauth.routes.ts`, `frontend/src/pages/auth/LoginPage.tsx`, `oauth-workflow.test.ts`, `discord-oauth-workflow.test.ts`, `oauth-invite-e2e.test.ts`.

**Implementierung:** Keine Client-Secrets. Callback-Origin nicht auf localhost oder den stillgelegten UCBS-Host lockern. Replay-Schutz nicht anfassen, außer ein Test ist rot.

**Tests:** bestehende OAuth-Suites. Button-Zustand „nicht verfügbar“ ohne ID.

**Akzeptanz:** Leere ENV erzeugt keinen Token-Request nach außen.

**Risiken:** Provider-Konsolen (Redirect-URLs) sind außerhalb des Repos.

**Abhängigkeiten:** keine.

---

## Phase K — CI führt die Backend-Tests aus

**Priorität:** P2  
**Ziel:** `.github/workflows/ci.yml` führt nach `npm ci` auch `npm test` aus, ohne Secrets und ohne Netzwerk zu Providern.

**Betroffene Dateien:** `.github/workflows/ci.yml`. Optional Timeout anheben, weil der Lauf lokal ca. 90 s braucht.

**Implementierung:** Ein Step `npm test`. Keine Firebase-Credentials im Workflow. Kein Playwright in diesem Schritt.

**Tests:** der Workflow selbst ist die Prüfung. Lokal vorher `npm test`.

**Akzeptanz:** PR-CI wird rot, wenn eine der 1245 Prüfungen rot wird.

**Risiken:** Windows-only Annahmen. Die Suite lief hier unter Node 24; CI nutzt Node 20. Wenn etwas nur auf 24 grün ist, in dieser Phase auf Node 20 nachziehen, nicht die CI-Version heimlich anheben, ohne es zu dokumentieren.

**Abhängigkeiten:** keine. Sinnvoll nach Phase A, damit der neue Gate mit in CI liegt.

---

## Phase L — Frontend-Tests für Quote und Payments-UI

**Priorität:** P2  
**Ziel:** Die Coins-Seite und ein Studio-Confirm rendern ohne Kauf und ohne Job, wenn die Plattform Payments und Generierung ausmeldet.

**Betroffene Dateien:** neues `frontend` Test-Setup nur wenn noch keins existiert (Vitest oder die vorhandene Node-Test-Art — die kleinere Ergänzung wählen, kein zweites Framework, falls eines schon halb liegt; aktuell liegt keins). `CoinsPage.tsx`, eine Studio-Page, `frontend/package.json`.

**Implementierung:** Komponenten mit gemocktem API-Client. Kein Browser-E2E in dieser Phase.

**Tests:** Payments aus → kein Checkout. Quote-Antwort → Confirm-Button, kein stiller Start. Flag-Fehler 503 → keine Erfolgsmeldung.

**Akzeptanz:** `npm test --workspace=frontend` grün und im CI-Job aus Phase K optional angehängt, sobald er stabil ist.

**Risiken:** React-19-Setup Aufwand. Klein halten: zwei Komponenten, nicht alle Studios.

**Abhängigkeiten:** Phase H für die Coins-Erwartung. Phase K kann parallel starten.

---

## Phase M — Railway-Config vor dem 1. Dezember 2026

**Priorität:** P2, wird P1 sobald das Datum näher als vier Wochen ist  
**Ziel:** `railway.toml` bleibt die einzige Config-as-Code-Datei, bis CLI 5 einen Plan **ohne** Env-, Domain-, Replica- oder Secret-Änderung validieren kann. Danach Migration nach `.railway/railway.ts`.

**Betroffene Dateien:** `railway.toml`, `package.json` (CLI-Version nur wenn die Doku das verlangt), `docs/production-deployment.md`, `backend/src/services/railway-config-e2e.test.ts`.

**Implementierung:** Kein `railway up`. Keine Variablen setzen. Zuerst CLI-Fähigkeit prüfen. Migration nur mit lesendem `config plan`, der der Betreiber freigibt.

**Tests:** bestehender Railway-Alignment-Test: genau eine CaC-Datei, keine Env-Werte im File, Health-Pfad `/health`.

**Akzeptanz:** Bis zur Migration deployt der bestehende Service weiter über das Dockerfile. Nach der Migration ist das TOML weg und der Plan enthält dieselben Builder-/Health-/Restart-Werte.

**Risiken:** Falsche CLI-Migration kann Replicas, Region oder Startbefehl ändern. Deshalb nicht autonom gegen Produktion ausführen.

**Abhängigkeiten:** Operator-Freigabe. Unabhängig von den KI-Flags.

---

## Phase N — Quote-Confirm über eine Replica hinaus

**Priorität:** P2  
**Ziel:** Ein zweites Replica kann denselben Quote nicht zweimal abbuchen. Heute reicht das prozesslokale Lock, weil Replicas = 1.

**Betroffene Dateien:** `backend/src/services/nexter/quotes.service.ts`, `backend/src/lib/dev-mutex.ts`, Coin-Transaktion in `coins.service.ts`, ein neuer Test nur gegen den Dev-Store oder eine extrahierte compare-and-set Funktion.

**Implementierung:** Quote-Status `pending → processing` in derselben Transaktion wie die Abbuchung, analog zu den bestehenden Coin-Transaktionen. Kein Redis. Replicas im TOML nicht hochsetzen.

**Tests:** zwei parallele `confirmQuote` auf denselben Quote: eine Abbuchung, ein Job, der zweite Call ist Replay.

**Akzeptanz:** Dev-Store und die pure Funktion zeigen genau eine Charge. Ein echter Firestore-Emulator-Lauf bleibt optional und wird nicht als ausgeführt behauptet, wenn er nicht lief.

**Risiken:** Falsche Transaktion könnte erfolgreiche Jobs ohne Refund hängen lassen. Erst Tests, dann kein Produktions-Replica-Wechsel.

**Abhängigkeiten:** keine Secret-Abhängigkeit. Nicht starten, solange Phase A und die bestehenden Quote-Tests grün sein müssen und diese Phase sie anfasst.

---

## Phase O — Signierte URLs nach Löschung

**Priorität:** P2  
**Ziel:** Nach Delete werden keine neuen URLs ausgestellt (ist so). Zusätzlich wird die TTL-Grenze in der API-Antwort und im Admin-Text ehrlich genannt. Eine echte sofortige Revocation ist mit Firebase Signed URLs nicht garantiert und wird nicht behauptet.

**Betroffene Dateien:** `signed-download` Service, File-Cloud-Route, `signed-download-urls.test.ts`, ggf. File-Cloud-UI-Hinweis.

**Implementierung:** Kein kürzeres TTL ohne Messung der Download-UX. Default nicht still ändern. Wenn geändert, dann mit Test auf den neuen Wert und einem Satz in der Security-Doku.

**Tests:** bestehende Signed-URL-Suite: fremde User 403, gelöschte Datei keine neue URL.

**Akzeptanz:** Verhalten bleibt ownership-sicher. Doku lügt nicht über Revocation.

**Risiken:** Zu kurze TTL bricht große Video-Downloads.

**Abhängigkeiten:** keine.

---

## Phase P — Legacy-Seiten aus dem aktiven Graph nehmen

**Priorität:** P3  
**Ziel:** Seiten, die nur noch `LegacyUnavailable` oder Redirect sind, nicht mehr als lebende Produktflächen pflegen. Erst Import-Graph prüfen, dann löschen, was nichts mehr importiert.

**Betroffene Dateien:** `frontend/src/pages/**` der in Audit-Abschnitt 26 genannten Seiten, `frontend/src/routes/legacy-surfaces.ts`, Navigation.

**Implementierung:** Keine Routen für Marketplace, Teams, Agency, White-Label, Live umhängen. V1-Sperre im Backend bleibt.

**Tests:** Backend-Test, der die Unavailable-Pfade und `FEATURE_NOT_AVAILABLE` weiter erwartet. Frontend-Build bleibt grün.

**Akzeptanz:** `npm run build` ohne die toten Pages, aktive Studios unverändert.

**Risiken:** Ein stiller Import aus dem Dashboard. Vor dem Löschen Grep auf den Dateinamen.

**Abhängigkeiten:** keine. Nach den P0/P1-Phasen.

---

## Phase Q — Bundle-Größe

**Priorität:** P3  
**Ziel:** Der Vite-Warnung für den 1,3-MB-Chunk und dem doppelten Firebase-Import begegnen, ohne das Routing zu ändern.

**Betroffene Dateien:** `frontend/src/lib/firebase.ts`, `frontend/src/services/api.ts`, `frontend/vite.config.ts` nur wenn Manual Chunks nötig sind.

**Implementierung:** Ein Import-Stil für Firebase. Schwere Studios, die schon `lazy` sind, nicht zurück auf statische Imports holen.

**Tests:** `npm run build` ohne die Firebase-Mischwarnung. Chunk-Limit nur senken, wenn der Hauptchunk real kleiner ist.

**Akzeptanz:** Build grün, Login und Auth-Context unverändert (manuell oder durch Phase L).

**Risiken:** Falscher Dynamic Import bricht Auth beim ersten Load.

**Abhängigkeiten:** Phase L hilfreich, nicht zwingend.

---

## Phase R — Spätere Produktflächen

**Priorität:** P3  
**Ziel:** Nicht in diesem Plan implementieren, nur Reihenfolge, falls sie später gewünscht sind.

1. Social-Publish (weiter `publishingAvailable: false`, bis ein Provider und eine Freigabe da sind).
2. Offizieller Suno-Adapter. Der inoffizielle Endpunkt bleibt aus.
3. Voice-Cloning nur mit Consent-Record und eigenem Flag. Bis dahin geschlossen.
4. Marketplace, Teams, Agentur, Kundenportal, White-Label.
5. Live-Streaming. V1 bleibt ohne RTMP-Produkt.

Jede dieser Flächen braucht eine eigene Quote-/Ownership-/Refund-Prüfung, bevor sie die V1-Sperre verliert.

**Abhängigkeiten:** Phasen A–H. Keine davon ist ein Startblocker für die Closed Beta.

---

## Empfohlene Reihenfolge

A → B → (C und D nur mit menschlichen Vorgaben) → E → F und G (Verifikation) → H, I, J unabhängig → K → L → M vor dem 1. Dezember 2026 → N und O → P, Q → R nie automatisch.

Nicht autonom starten: C, D, M gegen Produktion, jedes Umschalten von `*_ENABLED` in Railway, Stripe, Provider-Keys, Firebase-Deploy, Replica-Änderung.
