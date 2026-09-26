# NEXTER Owner Actions

Nur Schritte, die nicht ohne echte Angaben, Secrets oder eine Produktionsfreigabe sicher im Code erledigt werden können. Keine Werte in dieses Dokument schreiben.

## Recht und Betreiber

1. Straße, PLZ und Kontakt-E-Mail für das Impressum liefern. Diese Felder sind absichtlich leer. Telefon, USt-Id und Register nur liefern, wenn sie rechtlich angegeben werden sollen.
2. AGB, Datenschutz, Impressum, Widerruf und Cookies juristisch freigeben. Die öffentlichen Texte sind Entwürfe. In den AGB stehen sechs Absätze mit `TODO` und `LEGAL REVIEW REQUIRED` (Nutzungsrechte, Beschwerden, KI-Inhalte, Stimme, kommerzielle Nutzung, Provider-Terms). Die nicht ersetzen, bevor ein freigegebener Wortlaut vorliegt.
3. Erst danach `LEGAL_TEXT_STATUS` von `draft` auf den freigegebenen Zustand setzen. Das ist eine bewusste Veröffentlichung, kein Code-Fix.

## Produktion: vier Flags stehen aktuell auf true

Manuell geprüft, nichts geändert. Diese Werte nicht nebenbei speichern. Speichern in Railway kann einen Rebuild auslösen.

- `IMAGE_GENERATIONS_ENABLED=true`
- `IMAGE_EDITS_ENABLED=true`
- `NEXTER_CHAT_ENABLED=true`
- `VIDEO_GENERATIONS_ENABLED=true`
- `PAYMENTS_ENABLED=false`
- `REGISTRATION_MODE=invite_only`
- `DEV_AUTH_BYPASS` ist nicht gesetzt

Für den ersten kontrollierten Testerbetrieb diese vier Flags in einem eigenen, freigegebenen Schritt auf `false` setzen, zusammen mit dem Deploy und nicht als stiller Zwischensave. Vorher prüfen, ob `OPENAI_API_KEY`, `REPLICATE_API_TOKEN` und `RUNWAY_API_KEY` nur als „vorhanden“ oder „fehlt“ gemeldet werden. Werte nicht in den Chat kopieren.

## Secrets in Railway

4. Die Namen aus `NEXTER_SECRETS_CHECKLIST.md` in Railway Variables eintragen. Nicht ins Repository.
5. Firebase-Admin (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`) und `FRONTEND_URL` oder `FRONTEND_URLS` müssen für den Produktionsstart gesetzt sein.
6. Bei `SERVE_STATIC=true` die öffentlichen `PUBLIC_FIREBASE_*` Werte setzen. Dieselben öffentlichen Werte nur bei einem getrennten Frontend-Build als `VITE_FIREBASE_*`.
7. `DEV_AUTH_BYPASS` in Produktion nicht setzen.

## Features einzeln freischalten

Jedes Flag nur auf exakt `true` stellen, wenn das zugehörige Secret schon liegt und die Kosten freigegeben sind. Der Readiness-Report unter Admin → Diagnose und `GET /api/v1/admin/readiness` zeigt danach READY oder NOT READY, ohne die Werte.

8. Text: `TEXT_GENERATIONS_ENABLED` und `OPENAI_API_KEY`
9. Automatische Untertitel: `CAPTIONS_GENERATIONS_ENABLED` und `OPENAI_API_KEY`. Der Key allein reicht nicht.
10. Nexter-Chat: `NEXTER_CHAT_ENABLED` und `OPENAI_API_KEY`
11. Live-Bilder: `IMAGE_GENERATIONS_ENABLED` und `OPENAI_API_KEY` oder `REPLICATE_API_TOKEN`
12. KI-Video und Animation: `VIDEO_GENERATIONS_ENABLED` und `RUNWAY_API_KEY` oder `REPLICATE_API_TOKEN`
13. Musik: `MUSIC_GENERATIONS_ENABLED` und `REPLICATE_API_TOKEN`. Suno nicht als Ersatz erwarten.
14. Katalog-TTS: `TTS_GENERATION_ENABLED` und `ELEVENLABS_API_KEY`. Voice-Cloning ist nicht gebaut.
15. Bildbearbeitung (`IMAGE_EDITS_ENABLED`) nur, wenn V.1 das ausdrücklich wollen. Der bisherige Stand lässt es aus.
16. Zahlungen: `PAYMENTS_ENABLED`, Stripe-Secret, Webhook-Secret, Price-IDs und den öffentlichen `pk_` Key. PayPal zusätzlich nur mit Live-Modus und Webhook-ID. Keinen Testkauf aus diesem Arbeitslauf starten.
17. Mail: Resend-Key und `EMAIL_FROM` auf einer eigenen verifizierten Domain.
18. Discord, Twitch, TikTok: Client-ID und Secret, Redirect-URL auf die Nexter-Origin. Microsoft-Client-ID in der App, Secret in der Firebase Console.

## Deployment, das hier nicht ausgeführt wurde

19. Firebase Rules und Indexes deployen, wenn der Live-Stand nicht dem Repo entspricht: `npm run deploy:firebase:rules` bzw. `deploy:firebase:firestore`. Das ändert Produktionsregeln und braucht eine eigene Freigabe.
20. Diesen Code-Stand auf `main` bringen und den bestehenden Railway-Service deployen, wenn der Stand freigegeben ist. Kein zweites Service, keine Replica-Erhöhung.
21. Vor dem 1. Dezember 2026 `railway.toml` mit Railway CLI 5 auf `.railway/railway.ts` migrieren. Die gepinnte CLI 4.6.3 kann das nicht. Die Migration nicht nebenbei mit Env-, Domain- oder Replica-Änderungen mischen.
22. Den nächsten GitHub-Lauf prüfen. Die CI führt `npm test` jetzt aus und nutzt Node 20. Lokal lief die Suite auf Node 24.

## Bewusst nicht entschieden

23. Öffentliche Registrierung (`REGISTRATION_MODE=public`) ist eine Produktentscheidung. Default bleibt `invite_only`.
24. Marketplace, Teams, Agentur, Kundenportal, White-Label, Live-Streaming und direktes Social-Publishing bleiben in V1 zu.
