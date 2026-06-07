# Auth Production Report – Creator Branding Studio

Stand: Umstellung auf echten Benutzerbetrieb (Firebase Auth only)

---

## Entfernte Dateien

| Datei | Grund |
|-------|--------|
| `apps/api/src/auth/mockAuth.ts` | Mock-Login, Demo-Passwörter, bcrypt-Local-Auth entfernt |

---

## Geänderte Auth-Dateien

| Datei | Änderung |
|-------|----------|
| `apps/api/src/auth/session.ts` | **Neu** – JWT-Cookie-Session, Middleware, kein Mock |
| `apps/api/src/auth/firebaseAuth.ts` | Firebase ID-Token, User-Anlage, Firestore-Sync |
| `apps/api/src/auth/index.ts` | Export nur Firebase + Session |
| `apps/api/src/auth/password.ts` | `DEMO_PASSWORD` und bcrypt-Hashing entfernt |
| `apps/api/src/routes/auth.ts` | `/login` & `/register` (Mock) entfernt; `/firebase`, `/status` |
| `apps/api/src/config.ts` | Default `AUTH_PROVIDER=firebase`; `ALLOW_MOCK_AUTH` entfernt |
| `apps/api/src/validateEnv.ts` | Mock-Auth blockiert; Firebase Pflicht in Production |
| `apps/api/src/index.ts` | `ensureDemoPasswordHashes()` entfernt |
| `apps/api/src/db/localDb.ts` | Demo-Seed-User entfernt; Migration löscht Legacy-Demo-Accounts |
| `apps/web/src/lib/firebase.ts` | **Neu** – Firebase Client (Login, Register, Reset) |
| `apps/web/src/store/authStore.ts` | Firebase → `/auth/firebase`; Config-Check |
| `apps/web/src/pages/LoginPage.tsx` | Demo-Hinweise entfernt; klare Fehlermeldung ohne Firebase |
| `apps/web/src/pages/TestModePage.tsx` | Demo-Tester-Hinweis entfernt |
| `.env.example` | `AUTH_PROVIDER=firebase`; `ALLOW_MOCK_AUTH` entfernt |
| `README.md` | Demo-Zugänge entfernt |

---

## Firebase Auth Status

| Komponente | Status |
|------------|--------|
| **Frontend – Registrierung** | ✅ `createUserWithEmailAndPassword` + Profilname |
| **Frontend – Login** | ✅ `signInWithEmailAndPassword` → ID Token |
| **Frontend – Passwort vergessen** | ✅ `sendPasswordResetEmail` |
| **Backend – Token-Verifikation** | ✅ Firebase Admin `verifyIdToken` |
| **Backend – Session** | ✅ JWT HttpOnly-Cookie nach Firebase-Login |
| **Backend – User-Anlage** | ✅ Automatisch in lokaler DB (`users`) |
| **Firestore – User-Dokument** | ✅ `users/{firebaseUid}` bei jedem Login/Register |
| **Admin-Rolle** | ✅ `ADMIN_EMAIL` env → Rolle `admin` beim ersten Login |
| **Mock-Fallback** | ❌ Deaktiviert – klare Fehlermeldung wenn Firebase fehlt |
| **Demo-Accounts** | ❌ Entfernt |

### Ablauf

1. Nutzer registriert sich / loggt sich im Frontend über Firebase Auth ein.
2. Frontend sendet Firebase ID Token an `POST /api/auth/firebase`.
3. Backend verifiziert Token, legt App-User an (falls neu), synchronisiert Firestore.
4. Backend setzt JWT-Session-Cookie für API-Zugriff.
5. `GET /api/auth/me` liefert den eingeloggten Benutzer.

### Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/api/auth/status` | Firebase konfiguriert? |
| POST | `/api/auth/firebase` | ID Token → Session |
| POST | `/api/auth/logout` | Session beenden |
| GET | `/api/auth/me` | Aktueller User |

---

## Benötigte Railway Variablen

### API Service

| Variable | Pflicht | Beschreibung |
|----------|---------|--------------|
| `NODE_ENV` | ✅ | `production` |
| `AUTH_PROVIDER` | ✅ | `firebase` |
| `JWT_SECRET` | ✅ | Min. 32 Zeichen, zufällig |
| `CORS_ORIGIN` | ✅ | Frontend-URL (z. B. `https://deine-app.railway.app`) |
| `FIREBASE_PROJECT_ID` | ✅ | Firebase Projekt-ID |
| `FIREBASE_CLIENT_EMAIL` | ✅ | Service-Account E-Mail |
| `FIREBASE_PRIVATE_KEY` | ✅ | Private Key (PEM, `\n` escaped) |
| `ADMIN_EMAIL` | Empfohlen | E-Mail erhält Admin-Rolle beim ersten Login |
| `OPENAI_API_KEY` | Optional | KI-Generierung |
| `STRIPE_SECRET_KEY` | Optional | Coin-Shop |
| `STRIPE_WEBHOOK_SECRET` | Optional | Stripe Webhooks |
| `ALLOW_MOCK_PAYMENTS` | ❌ | Muss `false` sein in Production |

### Web / Frontend Build

| Variable | Pflicht | Beschreibung |
|----------|---------|--------------|
| `VITE_FIREBASE_API_KEY` | ✅ | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | ✅ | z. B. `projekt.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | ✅ | Gleiche Projekt-ID |
| `VITE_FIREBASE_APP_ID` | ✅ | Firebase App ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Optional | Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Optional | Messaging Sender ID |
| `VITE_API_URL` | Optional | API-URL falls nicht same-origin |

### Firebase Console (einmalig)

1. **Authentication** → Sign-in method → **E-Mail/Passwort** aktivieren
2. **Service Account** → Private Key generieren → Railway `FIREBASE_*` setzen
3. **Firestore** → Datenbank anlegen (User-Dokumente unter `users/{uid}`)
4. Authorized domains: Production-Domain hinzufügen

---

## Sicherheit – Checkliste

- [x] Keine Hardcoded Demo-Benutzer
- [x] Keine Hardcoded Passwörter (`Demo2024!` entfernt)
- [x] Kein Mock-Login im Backend
- [x] Keine Demo-Hinweise im Login-UI
- [x] Kein Fallback auf Mock bei fehlendem Firebase
- [x] Production blockiert `ALLOW_MOCK_AUTH` (Variable entfernt)

---

## Lokale Entwicklung

1. `.env` und `apps/web/.env.local` mit echten Firebase-Werten füllen
2. `AUTH_PROVIDER=firebase`
3. `npm run dev`
4. Registrierung über Login-Seite → neues echtes Konto

Ohne Firebase-Konfiguration zeigt die Login-Seite eine **klare Fehlermeldung** – kein stilles Fallback.
