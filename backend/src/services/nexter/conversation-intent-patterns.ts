/** Social / routing utterance patterns. No tool imports — keeps intent files acyclic. */

function normalizeUtterance(message: string): string {
  return String(message ?? '')
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/[.!?…]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAsidePrefix(normalized: string): string {
  return normalized.replace(/^(übrigens|im übrigen|ach ja|btw|anyway|apropos)[,:]?\s+/i, '').trim();
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function isSmalltalkMessage(message: string): boolean {
  const raw = stripAsidePrefix(normalizeUtterance(message));
  if (!raw) return false;
  const words = wordCount(raw);
  if (words > 14) return false;

  if (
    /^(wie geht('?s| es)( dir|s dir)?|how are you|how('?s it going)|how have you been|wie war dein tag|how was your day|alles klar|was machst du|was geht|na(n)?\b)$/i.test(
      raw
    )
  ) {
    return true;
  }
  if (
    /^(hallo|hi|hey|moin|servus|guten morgen|guten tag|guten abend|good morning|good evening|hey nexter|hallo nexter)( nexter)?$/i.test(
      raw
    )
  ) {
    return true;
  }
  if (/^(danke( dir| schön|scheen)?|thanks|thank you|thx|merci)$/i.test(raw)) return true;
  if (/^(danke,? reicht erstmal|reicht erstmal|erstmal danke|passt erstmal|spaeter|später)$/i.test(raw)) {
    return true;
  }
  if (/^(was bist du( eigentlich)?|wer bist du|erzähl mir (von )?dir|what are you)$/i.test(raw)) {
    return true;
  }
  if (/witz|joke/.test(raw) && words <= 8) return true;
  if (/^(cool|nice|super|lol|haha|gefällt mir|das gefällt mir|awesome|ok|okay)$/i.test(raw)) return true;
  return false;
}

export function isTopicResetMessage(message: string): boolean {
  const raw = normalizeUtterance(message);
  if (/^(übrigens|ach ja|btw)\b/.test(raw) && isSmalltalkMessage(message)) return true;
  return /reicht erstmal|erstmal danke|passt erstmal/.test(raw);
}

export function isCreatorAdviceMessage(message: string): boolean {
  const t = normalizeUtterance(message);
  if (isProjectAnalysisMessage(message)) return false;
  return (
    /welche farben passen|farben passen zu|was (könnte|sollte) ich( heute)? streamen|branding empfehlen|streamdesign verbessern|was würdest du( mir)? (für mein branding|empfehlen)|wie kann ich mein (streamdesign|branding)|was hältst du von meinem|wie findest du mein/.test(
      t
    )
  );
}

export function isProjectAnalysisMessage(message: string): boolean {
  const t = normalizeUtterance(message);
  return (
    /was fehlt( mir| meinem| noch)?|welche assets fehlen|was habe ich schon erstellt|analysiere (mein |das )?(aktuelles )?projekt|analysiere mein(en)? streamset|lücken (in|von|im)|was wei(ss|ß)t du über mein(e|en)? (aktuelles )?(creator-)?projekt|über mein aktuelles creator-projekt|projektstand|inventar/.test(
      t
    )
  );
}

export function isAppHelpMessage(message: string): boolean {
  const t = normalizeUtterance(message);
  return (
    /was kann nexter|wie funktioniert (der |die |das )?(coin shop|creator dna|nexter)|wo finde ich (meine )?dateien|was ist creator dna|welche studios gibt es/.test(
      t
    )
  );
}

export function isAccountSettingsMessage(message: string): boolean {
  const t = normalizeUtterance(message);
  return (
    /ändere meine nexter-farbe|nexter-farbe|welche einstellungen habe ich|wie ändere ich mein profil|app-farbe|theme ändern/.test(
      t
    )
  );
}

export function isAmbiguousBareMessage(message: string): boolean {
  const t = normalizeUtterance(message);
  return /^(mach mal|ändere das|kannst du das|das da|was meinst du|mach es|änder das)$/i.test(t);
}

export function messageImpliesFormatNeed(message: string): boolean {
  if (isSmalltalkMessage(message) || isAppHelpMessage(message) || isAccountSettingsMessage(message)) {
    return false;
  }
  if (/was hältst du|wie findest du/.test(normalizeUtterance(message))) return false;
  return /tiktok|shorts|reel|twitch|youtube|instagram|discord|9:16|16:9|1:1|video|banner|overlay|hintergrund|facecam|streamset|\bshort\b/.test(
    normalizeUtterance(message)
  );
}
