# Etappe 5 — Marketplace Setup

## Was geändert wurde

- **Dev-Seed:** `seedMarketplaceDev()` läuft nur wenn `!isProduction() && isDevMode()` — keine Demo-Listings in Production.
- **Echte Uploads:** Listings erfordern `previewDataUrl` (Vorschau-Bild) und `assetDataUrl` (Download-Datei). Assets werden nach Firebase Storage unter `marketplace/` hochgeladen.
- **Keine Platzhalter:** SVG-Placeholder und automatische Fallback-URLs bei `createListing` entfernt.
- **Production-Filter:** System-Listings (`sellerId: system`) und SVG-Platzhalter werden im Shop ausgeblendet.
- **Verkäufer:** Eigene Listings können über `DELETE /api/v1/marketplace/listings/:id` deaktiviert werden.

## Erlaubte Dateitypen

| Rolle | Formate | Max. Größe |
|-------|---------|------------|
| Vorschau | PNG, JPG, WebP, GIF | 5 MB |
| Asset | PNG, JPG, WebP, GIF, PDF, ZIP, MP4 | 5 MB (Video bis 50 MB via Video-Validator) |

## API

### Listing erstellen

```http
POST /api/v1/marketplace/listings
Authorization: Bearer <token>
Permission: SELL_MARKETPLACE

{
  "title": "Neon Logo Pack",
  "description": "5 Varianten",
  "category": "logo",
  "priceCoins": 25,
  "previewDataUrl": "data:image/png;base64,...",
  "assetDataUrl": "data:application/zip;base64,..."
}
```

### Listing deaktivieren

```http
DELETE /api/v1/marketplace/listings/:id
```

## Firebase Storage

Marketplace-Uploads nutzen `uploadAssetFromDataUrl` — Firebase Storage muss aktiviert sein (siehe Deploy-Doku).

## Tests

```bash
node scripts/test-etappe5.mjs
npm run typecheck
```

## Dev-Demo-Listings

In Dev-Mode erscheinen zwei `[Dev]`-Listings mit `sellerId: system` zum Testen von Kauf/Download — in Production unsichtbar.
