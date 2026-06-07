import type { CreatorNiche, StreamSetPlatform, VisualStyle } from '@cbs/shared';

export const WIZARD_PLATFORMS: { id: StreamSetPlatform; emoji: string; label: string }[] = [
  { id: 'tiktok', emoji: '📱', label: 'TikTok' },
  { id: 'twitch', emoji: '🎮', label: 'Twitch' },
  { id: 'youtube', emoji: '▶️', label: 'YouTube' },
  { id: 'discord', emoji: '💬', label: 'Discord' },
];

export const WIZARD_NICHES: { id: CreatorNiche; emoji: string; label: string }[] = [
  { id: 'Gaming', emoji: '🎮', label: 'Gaming' },
  { id: 'Streaming', emoji: '🎥', label: 'Streaming' },
  { id: 'DJ', emoji: '🎧', label: 'DJ' },
  { id: 'Podcast', emoji: '🎙', label: 'Podcast' },
  { id: 'Community', emoji: '👥', label: 'Community' },
  { id: 'Esports', emoji: '🏆', label: 'Esports' },
];

export const WIZARD_STYLES: {
  id: VisualStyle;
  emoji: string;
  label: string;
  preview: string;
  description: string;
}[] = [
  { id: 'Esports', emoji: '🎮', label: 'Esports', preview: 'linear-gradient(135deg,#00f5ff,#ff2d95,#1a1a2e)', description: 'Leuchtend, dynamisch, wettbewerbsorientiert' },
  { id: 'Call of Duty', emoji: '💀', label: 'Call of Duty', preview: 'linear-gradient(135deg,#3d4a2a,#8b7355,#0a0a0a)', description: 'Düster, militärisch, kraftvoll' },
  { id: 'Fortnite', emoji: '🏗', label: 'Fortnite', preview: 'linear-gradient(135deg,#5b9cff,#ff6bcb,#ffe600)', description: 'Bunt, verspielt, cartoonhaft' },
  { id: 'Anime', emoji: '🎌', label: 'Anime', preview: 'linear-gradient(135deg,#ff6b9d,#c44dff,#00d4ff)', description: 'Lebendig, japanisch inspiriert' },
  { id: 'Cyberpunk', emoji: '🌆', label: 'Cyberpunk', preview: 'linear-gradient(135deg,#ff0080,#00ffff,#120458)', description: 'Neon, futuristisch, urban' },
  { id: 'Techno', emoji: '🎧', label: 'Techno', preview: 'linear-gradient(135deg,#00ff88,#ff00aa,#000000)', description: 'Club-Feeling, rhythmisch, kontrastreich' },
  { id: 'Hardstyle', emoji: '🔊', label: 'Hardstyle', preview: 'linear-gradient(135deg,#ff4400,#9900ff,#111111)', description: 'Hard, energiegeladen, festival-ready' },
  { id: 'Minimalistisch', emoji: '✨', label: 'Minimalistisch', preview: 'linear-gradient(135deg,#ffffff,#cccccc,#333333)', description: 'Sauber, reduziert, elegant' },
  { id: 'Realistisch', emoji: '📸', label: 'Realistisch', preview: 'linear-gradient(135deg,#4a5568,#718096,#2d3748)', description: 'Natürlich, authentisch, hochwertig' },
  { id: 'Ultra Cinematic 3D', emoji: '🔥', label: 'Ultra Cinematic 3D', preview: 'linear-gradient(135deg,#ff6a00,#ff006e,#1a0033)', description: 'Filmisch, dramatisch, premium' },
];

export type ColorMode = 'ai' | 'custom' | 'dna';

export const COLOR_MODES: { id: ColorMode; emoji: string; label: string; hint: string }[] = [
  { id: 'ai', emoji: '🎨', label: 'KI entscheidet automatisch', hint: 'Wir wählen passende Farben für dich – am einfachsten.' },
  { id: 'custom', emoji: '🌈', label: 'Eigene Farben auswählen', hint: 'Du bestimmst deine Lieblingsfarben selbst.' },
  { id: 'dna', emoji: '🧬', label: 'Branding DNA verwenden', hint: 'Farben passend zu deiner Art & deinem Stil.' },
];

export const INCLUDED_FILES = [
  'Logo',
  'Banner',
  'Overlay',
  'Facecam',
  'Intro',
  'Outro',
  '5 Sticker',
  'Social Media Dateien',
];

export const WIZARD_STEP_LABELS = [
  'Plattform',
  'Name',
  'Art',
  'Stil',
  'Farben',
  'Fertig',
];

export function friendlyProgressMessage(current?: string, phase?: string): string {
  if (phase === 'qc') return 'Download wird vorbereitet...';
  if (!current) return 'Dein Branding wird vorbereitet...';
  const lower = current.toLowerCase();
  if (lower.includes('logo')) return 'Logo wird erstellt...';
  if (lower.includes('banner')) return 'Banner wird erstellt...';
  if (lower.includes('sticker')) return 'Sticker werden erstellt...';
  if (lower.includes('intro')) return 'Intro wird erstellt...';
  if (lower.includes('outro')) return 'Outro wird erstellt...';
  if (lower.includes('overlay')) return 'Overlay wird erstellt...';
  if (lower.includes('facecam')) return 'Facecam Rahmen wird erstellt...';
  if (lower.includes('social') || lower.includes('profil')) return 'Social Media Dateien werden erstellt...';
  if (lower.includes('offline') || lower.includes('panel')) return 'Streaming-Elemente werden erstellt...';
  return `${current} wird erstellt...`;
}
