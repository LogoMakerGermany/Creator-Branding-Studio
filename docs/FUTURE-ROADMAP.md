# Future Roadmap – UCBS Streaming Plattform

Diese Features waren als **Phase 6–9** geplant, werden aber bewusst **nicht** in der aktuellen Version ausgeliefert. Sie sind für ein späteres Major-Update vorgesehen (langfristig, ca. in mehreren Jahren).

## Geplantes Update: Eigene Streaming-Plattform

| Phase | Feature |
|-------|---------|
| 6 | Eigene Kanäle, HLS-Player, Live-Entdeckung (`/streams`, `/watch/:slug`) |
| 7 | Live-Chat, Follow, Benachrichtigungen |
| 8 | VOD, Clips, Kategorien-Suche |
| 9 | Subs (Coins), Emotes, Raids |

## Was bleibt in UCBS v1.0

Branding, DNA, Studios, Layout, Video-Schnitt, VTuber, Marketplace, Social & Kalender — alles im **Browser**, ohne eigene Streaming-Plattform.

## Geplant für ein späteres Update

**Live Streaming Tools** (ehemals `/live-streaming`):

- RTMP-Server & Stream-Key
- Multistream-Steuerung (Twitch, YouTube, TikTok, Kick, Facebook)
- Overlays, Alerts, Go-Live-Checkliste

Creator streamen in v1.0 weiterhin auf **bestehenden Plattformen**. UCBS liefert Branding und Assets (Overlays, Intros, Layouts) — die Streaming-Steuerung kommt später.

## Technische Voraussetzungen (später)

- RTMP/HLS-Infrastruktur (z. B. nginx-rtmp, Cloudflare Stream, Mux)
- WebSocket oder Firebase für Echtzeit-Chat
- CDN für VOD/Clips
- Moderation & Reports (Phase 10)
