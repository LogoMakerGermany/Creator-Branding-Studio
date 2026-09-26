# NEXTER Owner Actions

Nur Schritte, die nicht ohne echte Angaben, Secrets oder eine Produktionsfreigabe sicher im Code erledigt werden können. Keine Werte in dieses Dokument schreiben. Erledigte Prüfungen nicht erneut anfordern.

## Erledigt, nicht erneut prüfen

- Persönlicher Zugriff auf Firebase „Nexter Creator Studio“, Railway-Service `nexter-creator-studio` und GitHub `LogoMakerGermany/Creator-Branding-Studio`.
- E-Mail/Passwort und Google sind in Firebase Authentication eingeschaltet. `nexter-creator-studio-production.up.railway.app` ist Authorized Domain.
- In Railway `production` vorhanden, ohne dass Werte angezeigt wurden: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET`, `FRONTEND_URL`, `FRONTEND_URLS`, `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_APP_ID`.
- `OPENAI_API_KEY` vorhanden. `RUNWAY_API_KEY` vorhanden. `REPLICATE_API_TOKEN` fehlt.
- `DEV_AUTH_BYPASS` fehlt. `PAYMENTS_ENABLED=false`. `REGISTRATION_MODE=invite_only`.
- Firestore Database und Storage sind im Firebase-Projekt vorhanden. Nichts wurde gelöscht, verändert oder deployed.
- Firebase-Production-Schritt am 26. September 2026 abgeschlossen: `content_rights_reports` ist live mit vollständigem Client-Deny; der Composite-Index `oauth_identities` auf `firebaseUid` aufsteigend und `createdAt` absteigend ist READY. Die bestehenden 42 Composite-Indexes sind weiterhin READY. Storage-Rules blieben unverändert. Keine unerwarteten Änderungen.
- Railway-Projekt `spectacular-nourishment`, Umgebung `production`: eine Replica, Region `sfo`, ein Service `nexter-creator-studio`, kein Volume, keine Railway-Datenbank. Nichts geändert.
- Impressum, Datenschutz, AGB, Widerruf und Cookies sind technisch als öffentliche Draft-Seiten eingebunden. Der gemeinsame Legal-Footer verlinkt alle fünf Seiten. Bis zur Veröffentlichung stehen ausschließlich `[BETREIBER_NAME]`, `[STRASSE_HAUSNUMMER]`, `[PLZ_ORT]` und `[KONTAKT_EMAIL]`; echte Angaben werden erst vor Veröffentlichung geliefert. `LEGAL_TEXT_STATUS` bleibt `draft`.

## Ist-Stand Produktion, bis zum freigegebenen Deploy nicht speichern

Diese vier Flags stehen auf `true`. Speichern in Railway kann einen Rebuild auslösen. Nicht nebenbei ändern.

- `IMAGE_GENERATIONS_ENABLED`
- `IMAGE_EDITS_ENABLED`
- `NEXTER_CHAT_ENABLED`
- `VIDEO_GENERATIONS_ENABLED`

Damit können Bildgenerierung, Bildbearbeitung und Nexter-Chat OpenAI aufrufen. KI-Video kann Runway aufrufen. Replicate-Bild, Replicate-Video und MusicGen können nicht, weil das Token fehlt. Für den ersten kontrollierten Testerbetrieb diese vier Flags in demselben freigegebenen Deploy auf `false` setzen, nicht als stiller Zwischensave.

## Offen

1. Vor Veröffentlichung die vier echten Impressumsangaben liefern und AGB, Datenschutz, Impressum, Widerruf und Cookies juristisch freigeben. Die öffentlichen Texte bleiben bis dahin Entwürfe. In den AGB stehen sechs Absätze mit `TODO` und `LEGAL REVIEW REQUIRED`.
2. Erst nach echten Angaben und juristischer Freigabe `LEGAL_TEXT_STATUS` von `draft` setzen.
3. Diesen Code-Stand auf `main` bringen und den bestehenden Railway-Service deployen, wenn der Stand freigegeben ist. Kein zweites Service, keine Replica-Erhöhung. Push und Deploy sind noch nicht freigegeben.
4. Vor dem 1. Dezember 2026 `railway.toml` mit Railway CLI 5 auf `.railway/railway.ts` migrieren. Die gepinnte CLI 4.6.3 kann das nicht.
5. Den GitHub-Lauf prüfen, sobald gepusht wurde. Die CI führt `npm test` aus und nutzt Node 20. Lokal lief die Suite auf Node 24.

## Erst nach separater Freigabe

Jedes Flag nur auf exakt `true` stellen, wenn das Secret schon liegt und die Kosten freigegeben sind.

- Text: `TEXT_GENERATIONS_ENABLED` und `OPENAI_API_KEY`
- Automatische Untertitel: `CAPTIONS_GENERATIONS_ENABLED` und `OPENAI_API_KEY`
- Musik: `MUSIC_GENERATIONS_ENABLED` und `REPLICATE_API_TOKEN`. Das Token fehlt derzeit. Suno schaltet nichts frei.
- Katalog-TTS: `TTS_GENERATION_ENABLED` und `ELEVENLABS_API_KEY`. Voice-Cloning ist nicht gebaut.
- Zahlungen: `PAYMENTS_ENABLED` plus Stripe- und gegebenenfalls PayPal-Namen. Aktuell aus.
- Mail: `RESEND_API_KEY` und `EMAIL_FROM` auf einer eigenen verifizierten Domain. Für den ersten Test nicht nötig, wenn der Einladungscode persönlich weitergegeben wird.
- Discord, Twitch, TikTok: Client-ID und Secret. Microsoft-Client-ID in der App, Secret in der Firebase Console.

## Bewusst nicht entschieden

- Öffentliche Registrierung (`REGISTRATION_MODE=public`) bleibt aus. Bestätigt ist `invite_only`.
- Marketplace, Teams, Agentur, Kundenportal, White-Label, Live-Streaming und direktes Social-Publishing bleiben in V1 zu.
- Keine zweite Domain. Die alte Host-Adresse nicht wieder aktivieren.
