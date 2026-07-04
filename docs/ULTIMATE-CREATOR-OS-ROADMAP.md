# Ultimate Creator OS — Roadmap

Phase 1 (current): **Creator in 60 Sekunden** — project model, wizard, pack orchestration, live preview, improvement chips, export center, project switcher.

## Vision

Ultimate Creator OS unifies DNA, MAGIK, CCD, and all studios into one creator workflow: one project, one style token, all platform assets, AI-assisted refinement.

## Phase 1 — Shipped scope

| Feature | Status |
|---------|--------|
| `UltimateCreatorProject` model + Firestore | Done |
| Pack orchestrator (65 coins, logo A+B + 7 assets) | Done |
| `/ultimate-creator` wizard | Done |
| Live preview (Twitch, YouTube, Discord, TikTok, Kick) | Done |
| Improvement chips in Logo Studio | Done |
| Export Center + TopBar project switcher | Done |
| API `/api/v1/ultimate-creator/*` | Done |

## Phase 2 — Next

- Regenerate single asset from project context
- Version history per asset
- ZIP batch export via backend
- Improvement chips wired to Ultimate project (not only Logo Studio)
- MAGIK AI Assistant suggestions on export gaps

## Phase 3 — Creator OS

- Cross-studio style lock (edit one → propagate)
- Team projects + shared DNA
- Scheduled social export presets
- Analytics: which variants perform best (MAGIK learning loop)

## Coins

- Ultimate Creator Pack: **65 coins** (includes MAGIK logo pair; no double charge)
- Standalone logo: **15 coins**

## Technical notes

- `runMagikLogoJobs()` — internal MAGIK run without coin deduct (used by pack)
- Style suffix appended to all pack prompts for visual consistency
- Requires active Creator DNA before pack start
