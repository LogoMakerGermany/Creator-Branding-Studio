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
  ice: 'frozen ice crystals',
  dragon: 'mighty dragon beast',
  drache: 'mighty dragon beast',
  ghost: 'spectral ghost spirit',
  sniper: 'tactical sniper soldier',
  phoenix: 'phoenix rebirth flames',
  phönix: 'phoenix rebirth flames',
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
  clan: 'clan team unity',
  squad: 'military squad unit',
  toxic: 'toxic green radioactive',
  frost: 'frost ice frozen',
  blaze: 'blaze inferno fire',
  reaper: 'grim reaper death',
  phantom: 'phantom ghost operative',
};

const COMPOUND_OVERRIDES: Array<{ pattern: RegExp; motif: string }> = [
  { pattern: /alienzecke/i, motif: 'alien tick hybrid parasite creature' },
  { pattern: /firewolf/i, motif: 'fire wolf blazing predator' },
  { pattern: /shadowhunter/i, motif: 'dark shadow hunter assassin' },
  { pattern: /venomking/i, motif: 'venom symbiote king monster' },
  { pattern: /icedragon/i, motif: 'ice dragon frozen beast' },
  { pattern: /ghostsniper/i, motif: 'ghost sniper spectral soldier' },
  { pattern: /phoenixgaming/i, motif: 'phoenix esports rebirth flames' },
  { pattern: /nightcrow/i, motif: 'night crow raven darkness' },
];

function splitNameTokens(name: string): string[] {
  const stripped = name.replace(/\d+/g, ' ').trim();
  const camel = stripped.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, '$1 $2');
  return camel
    .toLowerCase()
    .split(/[\s_.-]+/)
    .filter((t) => t.length > 1);
}

function matchCompound(name: string): string | null {
  const compact = name.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
  for (const { pattern, motif } of COMPOUND_OVERRIDES) {
    if (pattern.test(compact)) return motif;
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

/** MAGIK AI — interpretiert den Namen automatisch. */
export function analyzeMagikName(logoName: string): {
  motifs: string[];
  summary: string;
  suggestRing: boolean;
} {
  const trimmed = logoName.trim();
  const compound = matchCompound(trimmed);
  const tokens = splitNameTokens(trimmed);
  const tokenMotifs = matchTokens(tokens);

  const motifs = compound ? [compound, ...tokenMotifs] : tokenMotifs;
  const unique = [...new Set(motifs)];

  if (unique.length === 0) {
    const fallback = `powerful esports emblem inspired by the name "${trimmed}", abstract aggressive gaming icon`;
    return {
      motifs: [fallback],
      summary: `Abstraktes Gaming-Emblem aus dem Namen „${trimmed}"`,
      suggestRing: trimmed.length <= 12,
    };
  }

  const summary = unique.slice(0, 2).join(' + ');
  return {
    motifs: unique,
    summary: `MAGIK AI: ${summary}`,
    suggestRing: unique.length <= 2 && trimmed.length <= 14,
  };
}

export function resolveMagikCharacter(character?: string, custom?: string): string {
  if (character === 'Eigene Figur' && custom?.trim()) return custom.trim();
  if (character && character !== 'Eigene Figur') return character;
  return '';
}
