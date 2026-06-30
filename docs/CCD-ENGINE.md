# Creator Character DNA Engine (CCD Engine)

> **Status:** Aktiv — Character DNA wird bei Logo-Generierung erstellt und in allen Generatoren wiederverwendet.

---

## Architektur

```
shared/src/creator-dna-engine/
├── types.ts                    → CharacterDNA, VisualDNA, Preferences, Evolution
├── character-dna.engine.ts     → Character DNA Engine
├── creator-preferences.engine.ts → Creator DNA Engine (Präferenzen)
├── prompt-dna.engine.ts        → Prompt DNA Engine
├── style-dna.engine.ts         → Style DNA Engine
├── evolution.engine.ts         → Evolution Engine
└── recommendation.engine.ts    → Recommendation Engine

backend/src/services/creator-dna-engine/
├── ccd-storage.service.ts      → Persistenz (Firestore/dev-store)
└── ccd-orchestrator.service.ts → Logo-Hook, Prompt-Kontext, Evolution

frontend/src/modules/creator-dna/   → Frontend-Modul
frontend/src/services/creator-dna/  → API-Wrapper
```

---

## Datenfluss

1. **Erste Logo-Generierung** → `buildCharacterDNA()` analysiert Name/Figur/Stil/Farben
2. **Speicherung** → `ccd_character_dna`, `ccd_creator_preferences` (pro User)
3. **MAGIK Prompt** → `buildPromptDNABundle()` kombiniert Character + Creator + Style + Platform + Game DNA
4. **Weitere Generatoren** → Banner, Facecam, Overlay, Sticker erhalten `characterDnaToPromptPhrase()`
5. **Evolution** → Nach Generierung optional `CharacterEvolutionProposal` (Nutzer akzeptiert/lehnt ab)
6. **Lernen** → MAGIK-Events fließen in `buildCreatorPreferencesDNA()`

---

## API

| Endpoint | Beschreibung |
|----------|--------------|
| `GET /api/v1/ccd` | Dashboard: Character, Preferences, Evolutionen, Empfehlungen |
| `GET /api/v1/ccd/context` | Prompt-Kontext für Generatoren |
| `POST /api/v1/ccd/evolution/:id/accept` | Evolution übernehmen |
| `POST /api/v1/ccd/evolution/:id/reject` | Evolution ablehnen |

---

## MAGIK Integration

Jeder Logo-Prompt enthält:

- **Qualitäts-DNA** (MAGIK_QUALITY_DNA)
- **Character DNA** (Figur, Visuelles, Farben, Effekte, Pose)
- **Creator DNA** (Präferenzen, Lieblingsfarben)
- **Style DNA** (Stil, Logo-Art, Mood)
- **Platform DNA** / **Game DNA**
- **Benutzerwünsche** (Formular)

---

## Character DNA Felder

### Grunddaten
Creator Name, Clan, Figur, Unterfigur, Persönlichkeit, Stil, Spiel, Plattform

### Visuelle DNA
Gesicht, Augen, Rüstung, Flügel, Hörner, Maske, Kapuze, Schmuck, Narben, …

### Farben
Primary, Secondary, Accent, Glow, Metal, Lighting

### Effekte, Pose, Umgebung
Aus Stil und Hintergrund abgeleitet, erweiterbar durch Evolution

---

## Evolution

Nach erfolgreichen Generierungen schlägt die Engine Erweiterungen vor:

- Neue Rüstung / Effekte / Pose / Umgebung
- Status: `pending` → `accepted` | `rejected`
- Nur bei **Accept** wird Character DNA aktualisiert

---

## Zukünftige Generatoren

Alle Module nutzen dieselbe Character DNA:

Logo · Banner · Facecam · Sticker · Overlay · Panels · Intro/Outro · VTuber · MAGIK Assistant · …
