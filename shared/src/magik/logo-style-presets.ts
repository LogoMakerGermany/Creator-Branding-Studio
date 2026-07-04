/** Logo Studio Schritt 2 — vollständige Stil-Auswahl */
export const LOGO_STUDIO_STYLE_PRESETS = [
  '2D',
  '3D',
  'Ultra Realistic',
  'Cinematic',
  'Hyper Realistic',
  'Esports',
  'Gaming',
  'Horror',
  'Fantasy',
  'Anime',
  'Cyberpunk',
  'Viking',
  'Medieval',
  'Military',
  'Sci-Fi',
  'Futuristic',
  'Neon',
  'Graffiti',
  'Minimalistisch',
  'Premium',
  'Luxury',
  'Cartoon',
  'Comic',
  'Dark',
  'Metallic',
  'Crystal',
  'Diamond',
] as const;

export type LogoStudioStylePreset = (typeof LOGO_STUDIO_STYLE_PRESETS)[number];

/** Gruppierte Darstellung in der UI */
export const LOGO_STYLE_GROUPS: { id: string; label: string; styles: LogoStudioStylePreset[] }[] = [
  { id: 'dimension', label: 'Dimension', styles: ['2D', '3D'] },
  {
    id: 'realism',
    label: 'Realismus & Film',
    styles: ['Ultra Realistic', 'Hyper Realistic', 'Cinematic'],
  },
  { id: 'gaming', label: 'Gaming & Esports', styles: ['Esports', 'Gaming', 'Premium', 'Luxury'] },
  {
    id: 'genre',
    label: 'Genre',
    styles: ['Horror', 'Fantasy', 'Anime', 'Cyberpunk', 'Sci-Fi', 'Futuristic'],
  },
  { id: 'culture', label: 'Kultur & Thema', styles: ['Viking', 'Medieval', 'Military'] },
  { id: 'look', label: 'Look & Stil', styles: ['Neon', 'Graffiti', 'Minimalistisch', 'Cartoon', 'Comic', 'Dark'] },
  { id: 'material', label: 'Material', styles: ['Metallic', 'Crystal', 'Diamond'] },
];

export const LOGO_STYLE_DESCRIPTIONS: Record<LogoStudioStylePreset, string> = {
  '2D': 'Flache Vektor-Optik, klare Silhouette',
  '3D': 'Extrudiertes 3D-Rendering mit Tiefe',
  'Ultra Realistic': 'Fotorealistische Materialien & Licht',
  Cinematic: 'Filmische AAA-Qualität, episch',
  'Hyper Realistic': 'Maximaler Realismus, feinste Details',
  Esports: 'Wettkampf-Emblem, professionell & kraftvoll',
  Gaming: 'Klassisches Gaming-Logo, dynamisch',
  Horror: 'Düster, bedrohlich, gruselige Atmosphäre',
  Fantasy: 'Magisch, legendär, mythisch',
  Anime: 'Anime-Ästhetik, bold & expressiv',
  Cyberpunk: 'Neon-Tech, futuristisch, edgy',
  Viking: 'Nordisch, Runen, Wikinger-Energie',
  Medieval: 'Ritterlich, Wappen, historisch',
  Military: 'Taktisch, militärisch, präzise',
  'Sci-Fi': 'Weltraum, futuristische Technologie',
  Futuristic: 'High-Tech, clean, forward-looking',
  Neon: 'Leuchtend, elektrisch, Streamer-Energy',
  Graffiti: 'Street-Art, urban, raw',
  Minimalistisch: 'Reduziert, clean, modern',
  Premium: 'High-End, luxuriös, polished',
  Luxury: 'Exklusiv, edel, refined',
  Cartoon: 'Cartoon-Stil, verspielt',
  Comic: 'Comic-Look, bold outlines',
  Dark: 'Dunkel, ominös, powerful',
  Metallic: 'Metall-Oberflächen, chrom & Stahl',
  Crystal: 'Kristall, Eis, refraktive Facetten',
  Diamond: 'Diamant, Brillanz, Premium-Glanz',
};

/** Legacy-Stile aus älteren Sessions → neue Presets */
export const LEGACY_MAGIK_STYLE_MAP: Record<string, LogoStudioStylePreset> = {
  'Ultra-Cinematic': 'Cinematic',
  Realistisch: 'Ultra Realistic',
  Fire: 'Gaming',
  Ice: 'Crystal',
  Toxic: 'Neon',
  Space: 'Sci-Fi',
  Apocalyptic: 'Dark',
  Mystisch: 'Fantasy',
};

export function normalizeMagikStyle(style?: string): LogoStudioStylePreset {
  if (!style?.trim()) return 'Esports';
  const trimmed = style.trim();
  if ((LOGO_STUDIO_STYLE_PRESETS as readonly string[]).includes(trimmed)) {
    return trimmed as LogoStudioStylePreset;
  }
  return LEGACY_MAGIK_STYLE_MAP[trimmed] ?? 'Esports';
}

/** MAGIK Prompt System — alle Logo-Studio-Stile */
export const MAGIK_STYLE_PRESETS = LOGO_STUDIO_STYLE_PRESETS;

export const DEFAULT_MAGIK_STYLE: LogoStudioStylePreset = 'Esports';
