# Phase 1–4 Migrationsnotizen

## Firestore Collections (neu)

| Collection | Zweck |
|------------|--------|
| `system_settings/platform` | `REGISTRATION_MODE`, Kill-Switches, aktive Preisversion |
| `invite_codes` | Einladungscodes (Felder laut Master §9) |
| `price_components` | Serverseitige Preiskomponenten (Cent) |
| `price_quotes` | Zeitlich begrenzte Preisangebote |
| `balance_ledger` | Unveränderliches Euro-Ledger |
| `user_balances` | Aktueller Euro-Saldo (Cent) |
| `ledger_idempotency` | Idempotenz-Schlüssel für Ledger-Buchungen |

## Auth-Änderungen

- Neue Nutzer erhalten Rolle `user` (Legacy `creator` wird beim Lesen auf `user` normalisiert)
- Tester über Invite `grantRole: tester`
- `/auth/sync` mit `inviteCode` bei `REGISTRATION_MODE=invite_only`
- Authentifizierung erstellt Profile nicht mehr automatisch

## Umgebungsvariablen

Siehe `backend/.env.example`:

- `REGISTRATION_MODE=invite_only`
- `PRICE_QUOTE_TTL_MINUTES=15`
- `GENERATIONS_ENABLED`, `IMAGE_GENERATIONS_ENABLED`, `VIDEO_GENERATIONS_ENABLED`, `PAYMENTS_ENABLED`
- Budget-Limits optional

## Admin-Bootstrap

Ersten Admin manuell in Firestore setzen:

```
users/{uid}.role = "admin"
```

Danach: `POST /api/v1/admin/invites` für Tester-Codes.
