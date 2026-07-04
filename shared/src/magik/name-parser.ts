/** Lexikon für MAGIK Modus 1 — Namensanalyse */
const TOKEN_MOTIFS: Record<string, string> = {
  alien: 'extraterrestrial alien creature',
  zecke: 'parasitic tick creature, creepy insectoid',
  fire: 'fire flames blazing',
  feuer: 'fire flames blazing',
  wolf: 'fierce wolf predator',
  shadow: 'dark shadow assassin',
  hunter: 'elite hunter warrior',
  venom: 'venom symbiote toxic monster',
  king: 'royal king crown authority',
  queen: 'royal queen crown regal feminine power',
  ice: 'frozen ice crystals',
  dragon: 'mighty dragon beast',
  drache: 'mighty dragon beast',
  ghost: 'spectral ghost spirit horror',
  ghostface: 'horror ghostface mask slasher',
  sniper: 'tactical sniper soldier military',
  phoenix: 'phoenix rebirth flames',
  phönix: 'phoenix rebirth flames',
  titan: 'titan colossus metallic giant warrior',
  night: 'midnight darkness',
  crow: 'crow raven dark bird',
  rabe: 'crow raven dark bird',
  ninja: 'stealth ninja warrior',
  cyber: 'cybernetic futuristic',
  skull: 'skull death emblem',
  totem: 'totemic tribal symbol',
  storm: 'lightning storm energy',
  thunder: 'thunder lightning',
  blood: 'blood crimson rage',
  dark: 'dark ominous power',
  light: 'radiant holy light',
  star: 'cosmic star energy',
  moon: 'lunar moon mystic',
  sun: 'solar sun blazing',
  demon: 'demon hellfire',
  angel: 'angelic wings divine',
  knight: 'medieval knight armor',
  samurai: 'samurai warrior blade',
  viper: 'viper snake strike',
  snake: 'serpent snake',
  tiger: 'tiger predator claws',
  lion: 'lion king mane',
  bear: 'grizzly bear strength',
  shark: 'shark predator ocean',
  kraken: 'kraken tentacles sea monster',
  robot: 'robot mech machine',
  mecha: 'giant mecha war machine',
  gaming: 'esports gaming energy',
  streamer: 'streamer neon creator energy',
  clan: 'clan team unity',
  squad: 'military squad unit',
  toxic: 'toxic green radioactive',
  frost: 'frost ice frozen',
  blaze: 'blaze inferno fire',
  reaper: 'grim reaper death',
  phantom: 'phantom ghost operative',
  anime: 'anime character energy',
  fantasy: 'fantasy magical realm',
  military: 'military tactical warfare',
  neon: 'neon electric glow',
  black: 'black elite aggressive power',
};

/** Stil-Vorschläge aus erkannten Namens-Begriffen */
const TOKEN_STYLE_HINTS: Record<string, string> = {
  ghost: 'Horror',
  ghostface: 'Horror',
  horror: 'Horror',
  reaper: 'Horror',
  demon: 'Horror',
  skull: 'Horror',
  dragon: 'Fantasy',
  drache: 'Fantasy',
  phoenix: 'Fantasy',
  phönix: 'Fantasy',
  queen: 'Fantasy',
  king: 'Fantasy',
  knight: 'Fantasy',
  fantasy: 'Fantasy',
  wolf: 'Esports',
  titan: 'Metallic',
  sniper: 'Military',
  military: 'Military',
  squad: 'Military',
  shadow: 'Dark',
  dark: 'Dark',
  black: 'Dark',
  gaming: 'Gaming',
  esports: 'Esports',
  clan: 'Esports',
  streamer: 'Neon',
  neon: 'Neon',
  cyber: 'Cyberpunk',
  anime: 'Anime',
  fire: 'Gaming',
  feuer: 'Gaming',
  ice: 'Crystal',
  frost: 'Crystal',
  toxic: 'Neon',
  space: 'Sci-Fi',
  viking: 'Viking',
  medieval: 'Medieval',
  crystal: 'Crystal',
  diamond: 'Diamond',
  metallic: 'Metallic',
};

const COMPOUND_OVERRIDES: Array<{ pattern: RegExp; motif: string; style?: string }> = [
  { pattern: /alienzecke/i, motif: 'alien tick hybrid parasite creature', style: 'Horror' },
  { pattern: /firewolf/i, motif: 'fire wolf blazing predator', style: 'Gaming' },
  { pattern: /shadowhunter/i, motif: 'dark shadow hunter assassin', style: 'Dark' },
  { pattern: /venomking/i, motif: 'venom symbiote king monster', style: 'Horror' },
  { pattern: /icedragon/i, motif: 'ice dragon frozen beast', style: 'Crystal' },
  { pattern: /ghostsniper/i, motif: 'ghost sniper spectral soldier', style: 'Horror' },
  { pattern: /ghostface/i, motif: 'horror ghostface mask slasher icon', style: 'Horror' },
  { pattern: /phoenixgaming/i, motif: 'phoenix esports rebirth flames', style: 'Esports' },
  { pattern: /nightcrow/i, motif: 'night crow raven darkness', style: 'Dark' },
  { pattern: /blackqueen/i, motif: 'dark queen royal feminine power', style: 'Fantasy' },
];

function splitNameTokens(name: string): string[] {
  const stripped = name.replace(/\d+/g, ' ').trim();
  const camel = stripped.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2');
  return camel
    .toLowerCase()
    .split(/[\s_.-]+/)
    .filter((t) => t.length > 1);
}

function matchCompound(name: string): { motif: string; style?: string } | null {
  const compact = name.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
  for (const entry of COMPOUND_OVERRIDES) {
    if (entry.pattern.test(compact)) {
      return { motif: entry.motif, style: entry.style };
    }
  }
  return null;
}

function matchTokens(tokens: string[]): string[] {
  const motifs: string[] = [];
  for (const token of tokens) {
    if (TOKEN_MOTIFS[token]) motifs.push(TOKEN_MOTIFS[token]);
    else if (token.length >= 4) {
      for (const [key, motif] of Object.entries(TOKEN_MOTIFS)) {
        if (token.includes(key) && key.length >= 3) {
          motifs.push(motif);
          break;
        }
      }
    }
  }
  return [...new Set(motifs)];
}

function resolveSuggestedStyle(tokens: string[], compoundStyle?: string): string {
  if (compoundStyle) return compoundStyle;
  for (const token of tokens) {
    if (TOKEN_STYLE_HINTS[token]) return TOKEN_STYLE_HINTS[token];
  }
  for (const token of tokens) {
    if (token.length >= 4) {
      for (const [key, style] of Object.entries(TOKEN_STYLE_HINTS)) {
        if (token.includes(key) && key.length >= 3) return style;
      }
    }
  }
  return 'Esports';
}

/** MAGIK AI — interpretiert den Namen automatisch. */
export function analyzeMagikName(logoName: string): {
  motifs: string[];
  summary: string;
  suggestRing: boolean;
  suggestedStyle: string;
  styleReason: string;
} {
  const trimmed = logoName.trim();
  const compoundMatch = matchCompound(trimmed);
  const tokens = splitNameTokens(trimmed);
  const tokenMotifs = matchTokens(tokens);

  const motifs = compoundMatch ? [compoundMatch.motif, ...tokenMotifs] : tokenMotifs;
  const unique = [...new Set(motifs)];
  const suggestedStyle = resolveSuggestedStyle(tokens, compoundMatch?.style);
  const styleReason =
    compoundMatch?.style || tokens.find((t) => TOKEN_STYLE_HINTS[t])
      ? `Stil „${suggestedStyle}" aus Namensanalyse`
      : 'Premium Gaming-Logo (Standard Esports-Stil)';

  if (unique.length === 0) {
    const fallback = `powerful esports emblem inspired by the name "${trimmed}", abstract aggressive gaming icon`;
    return {
      motifs: [fallback],
      summary: `Abstraktes Gaming-Emblem aus dem Namen „${trimmed}"`,
      suggestRing: trimmed.length <= 12,
      suggestedStyle: 'Esports',
      styleReason: 'Kein Motiv erkannt — hochwertiges Gaming-Logo',
    };
  }

  const summary = unique.slice(0, 2).join(' + ');
  return {
    motifs: unique,
    summary: `MAGIK AI: ${summary} → ${suggestedStyle}`,
    suggestRing: unique.length <= 2 && trimmed.length <= 14,
    suggestedStyle,
    styleReason,
  };
}

export function resolveMagikCharacter(character?: string, custom?: string): string {
  if (character === 'Eigene Figur' && custom?.trim()) return custom.trim();
  if (character && character !== 'Eigene Figur') return character;
  return '';
}
