# Railway Healthcheck – Root Cause & Fix

## Exakte Ursache des 503-Fehlers

**Deployed war der alte `index.ts` auf `main` (HEAD vor Fix), nicht der korrigierte Workspace-Stand.**

### Alter Code (Railway / `main` committed)

```typescript
async function start() {
  validateEnvOnStartup();
  await getDb();                    // ❌ blockiert
  app.listen(env.port, () => {      // ❌ kein 0.0.0.0
    console.log(`... http://localhost:${env.port}`);
  });
}
```

| Problem | Effekt |
|---------|--------|
| `await getDb()` **vor** `app.listen()` | Railway sendet Healthcheck, **bevor** ein Port offen ist → **503** |
| Kein `'0.0.0.0'` | In Docker/ Railway erreicht der Proxy den Prozess oft nicht |
| Kein `/health` | `railway.json` zeigt auf `/health`, Route existierte nicht |
| `/api/health` hinter Middleware | Rate-Limit / Helmet / CORS potenziell im Weg |
| Log `localhost:8080` | Bestätigt alten Deploy-Stand |

### Neuer Code (Patch)

```typescript
// 1. /health + /api/health GANZ OBEN (vor applySecurity)
// 2. validateEnvOnStartup() – sync, schnell
// 3. app.listen(env.port, '0.0.0.0') – SOFORT
// 4. getDb() im Hintergrund (void, nicht await)
```

## Erwartete Railway Deploy Logs (nach Fix)

```
[startup] PORT = 8080
[startup] NODE_ENV = production
[env] ✓ Startup-Check OK (production, auth=firebase, db=local)
Creator Branding Studio API → http://0.0.0.0:8080
[startup] Server listening – healthchecks active, DB init in background
RAILWAY HEALTHCHECK HIT
HEALTHCHECK HIT
[startup] Database ready
```

## Wenn Logs fehlen

| Fehlende Zeile | Wahrscheinliche Ursache |
|----------------|-------------------------|
| `[startup] PORT =` | Alter Build / falscher Startbefehl |
| `→ http://0.0.0.0:` | Alter `index.ts` noch deployed |
| `RAILWAY HEALTHCHECK HIT` | Healthcheck erreicht App nicht (Port/Pfad) |
| `Creator Branding Studio API →` | `validateEnvOnStartup()` wirft → `process.exit(1)` vor listen |

## railway.json

```json
"healthcheckPath": "/health"
```

**Railway UI prüfen:** Settings → Healthcheck Path muss `/health` sein (kein Override auf `/api/health`).

## Env-Blocker vor listen()

Production wirft ab bei u.a.:

- `CORS_ORIGIN` fehlt
- `JWT_SECRET` fehlt / zu schwach
- `AUTH_PROVIDER` ≠ `firebase`
- Firebase Admin Variablen fehlen
- `STRIPE_SECRET_KEY` ohne `STRIPE_WEBHOOK_SECRET`

Dann erscheint **kein** `Creator Branding Studio API →` und Healthcheck = 503.
