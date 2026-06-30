# MAGIK AI Assistant — Roadmap

> **Status:** Vorbereitungsphase (`preparation`)  
> **Priorität:** Logo Generator & MAGIK Prompt System haben Vorrang.  
> Der Assistant wird erst aktiviert, wenn diese Bereiche produktionsreif sind.

---

## Architektur (vorbereitet)

| Bereich | Pfad | Zweck |
|---------|------|--------|
| Shared Types | `shared/src/magik-ai/` | Datenmodelle, Konstanten, Settings |
| Backend Services | `backend/src/services/magik-ai/` | Avatar, Conversation, Memory, Recommendation (Platzhalter) |
| Logo-Kontext | `logo-context.service.ts` | Speichert Generierungsdaten nach jedem Logo |
| API | `POST/GET /api/v1/magik-ai/*` | Status, Settings, Platzhalter-Endpunkte |
| Frontend Modul | `frontend/src/modules/magik-ai/` | Feature-Flags & UI-Konfiguration |
| Frontend Services | `frontend/src/services/magik/` | API-Wrapper (Platzhalter) |
| UI Shell | `frontend/src/components/magik/` | Rechts unten, minimierbar, deaktiviert |
| Einstellungen | `/settings/magik-assistant` | Optionen als „Demnächst verfügbar“ |

---

## Phase 1 — Logo Generator (aktuell)

- [x] Logo Generator
- [x] MAGIK Prompt System
- [x] Ultimate Qualitäts-DNA
- [x] Namensanalyse (MAGIK AI)
- [x] Figurenauswahl
- [x] Dual-Varianten A + B
- [x] Logo-Kontext-Speicherung (intern, ohne UI)
- [x] Assistant-Architektur vorbereitet

**Fokus:** Ultra-Cinematic Qualität, professionelle UI, stabile KI-Generierung.

---

## Phase 2 — MAGIK Assistant erscheint

- [ ] Assistant nach Logo-Generierung aktivieren
- [ ] Hauptfigur des Logos wird persönlicher Begleiter (`MagikAvatarService`)
- [ ] UI-Shell mit sichtbarem Avatar (minimal)
- [ ] `MAGIK_AI_ASSISTANT_ENABLED = true`
- [ ] Einstellung „MAGIK Assistant aktivieren“ freischalten

**Datenbasis:** `MagikLogoContextRecord` (Name, Stil, Farben, Figur, Hintergrund, Prompt, Bild-URL)

---

## Phase 3 — Eigene KI & Interaktion

- [ ] `MagikConversationService` — Chat & Kontext
- [ ] `MagikMemoryService` — Gedächtnis & Präferenzen
- [ ] `MagikRecommendationService` — Stil-, Farb- und Generator-Empfehlungen
- [ ] Animationen (Basis)
- [ ] Persönlichkeits-Profile live nutzbar

---

## Phase 4 — Sprache & Personalisierung

- [ ] Sprachinteraktion & Voice-Output
- [ ] Emotionen & Reaktionen
- [ ] Erweitertes Lernsystem (Assistant-spezifisch)
- [ ] Unterstützung aller Generatoren (Banner, Overlay, VTuber, …)
- [ ] Vollständige Personalisierung

---

## Datenmodell (erweiterbar)

```typescript
MagikAiAvatar       // Name, Figur, Avatar-Bild, Persönlichkeit, Animation, Gedächtnis
MagikAiSettings     // Aktivierung, Animationen, Sprache, Persönlichkeit
MagikLogoContextRecord  // Pro Generierung: Kontext für Phase 2
MagikAiMemoryEntry  // Langzeit-Gedächtnis
MagikAiRecommendation // Vorschläge
```

---

## Wichtige Regeln

1. **Keine vorzeitige KI-Logik** — Services sind Platzhalter bis zur jeweiligen Phase.
2. **Logo-Generator unberührt** — Assistant darf Generierung nicht verlangsamen.
3. **Logo-Kontext** wird fire-and-forget nach `generateMagikLogoPair` gespeichert.
4. **UI standardmäßig deaktiviert** — Shell sichtbar, aber ohne Figur, Dialog oder Animation.

---

## Nächste Schritte (nach Phase-1-Release)

1. Produktionsreife Logo-Pipeline abschließen & deployen
2. Phase-2-Spezifikation: Avatar aus Logo-Kontext ableiten
3. `MagikAvatarService.createFromLogoContext()` implementieren
4. Feature-Flag `MAGIK_AI_ASSISTANT_ENABLED` aktivieren
