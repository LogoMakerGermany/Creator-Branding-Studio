/**
 * Modification Assistant (Block V.0) — typed change understanding.
 * Does not call providers. Does not invent prices. Does not claim visual detection.
 */

import type { ProjectAssetRole } from './project-memory';

export const MODIFICATION_CHANGE_KINDS = [
  'TEXT_REPLACE',
  'TEXT_REMOVE',
  'TEXT_ADD',
  'COLOR_CHANGE',
  'BACKGROUND_CHANGE',
  'BACKGROUND_REMOVE',
  'ELEMENT_REMOVE',
  'ELEMENT_ADD',
  'ELEMENT_REPLACE',
  'STYLE_CHANGE',
  'CROP',
  'RESIZE',
  'ASPECT_RATIO_CHANGE',
  'POSITION_CHANGE',
  'BRIGHTNESS_CHANGE',
  'CONTRAST_CHANGE',
  'EFFECT_CHANGE',
  'GENERAL_VISUAL_CHANGE',
  'OTHER',
] as const;

export type ModificationChangeKind = (typeof MODIFICATION_CHANGE_KINDS)[number];

export type ProviderCapabilityKind =
  | 'IMAGE_CREATE'
  | 'IMAGE_EDIT'
  | 'IMAGE_VARIATION'
  | 'IMAGE_INPAINT'
  | 'IMAGE_OUTPAINT'
  | 'VIDEO_CREATE'
  | 'VIDEO_EDIT'
  | 'AUDIO_EDIT';

export type ModificationTargetSource =
  | 'upload'
  | 'explicit_asset'
  | 'explicit_version'
  | 'project_role'
  | 'session_referent'
  | 'project_current';

export interface ModificationChange {
  kind: ModificationChangeKind;
  from?: string;
  to?: string;
  element?: string;
  value?: string;
}

export interface PreserveInstruction {
  kind: string;
  element?: string;
}

export interface ModificationTarget {
  assetId?: string;
  fileId?: string;
  role?: ProjectAssetRole | string;
  source: ModificationTargetSource;
  projectId?: string;
  name?: string;
  availability?: 'available' | 'unavailable' | 'missing';
}

export interface ModificationOutputSpec {
  aspectRatio?: string;
  format?: string;
}

export interface ModificationRequest {
  projectId?: string;
  target?: ModificationTarget;
  changes: ModificationChange[];
  preserve: PreserveInstruction[];
  output?: ModificationOutputSpec;
  userText: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  missingInformation: string[];
  requiresClarification: boolean;
  quoteRequired: boolean;
  executable: boolean;
  providerCapability?: ProviderCapabilityKind;
  matchProject?: boolean;
  matchDna?: boolean;
  replaceCurrent: boolean;
  contradictions: string[];
  pricing: { defined: false; reason: 'PRICING_DECISION_REQUIRED' };
}

export interface ModificationSessionState {
  targetAssetId?: string;
  targetFileId?: string;
  targetRole?: string;
  targetProjectId?: string;
  targetName?: string;
  targetSource?: ModificationTargetSource;
  changes: ModificationChange[];
  preserve: PreserveInstruction[];
  replaceCurrent: boolean;
  matchProject?: boolean;
  matchDna?: boolean;
}

export interface ProviderCapabilitySnapshot {
  IMAGE_CREATE: boolean;
  IMAGE_EDIT: boolean;
  IMAGE_VARIATION: boolean;
  IMAGE_INPAINT: boolean;
  IMAGE_OUTPAINT: boolean;
  VIDEO_CREATE: boolean;
  VIDEO_EDIT: boolean;
  AUDIO_EDIT: boolean;
}

const CREATE_NEW_ASSET =
  /\b(make me a new|make a new|create a new|create me a|erstell(?:e|en)? mir ein|mach mir ein(?:en|es)? neues)\b/i;

export function isCreateNewAssetUtterance(message: string): boolean {
  const t = String(message ?? '').trim();
  if (!t) return false;
  if (CREATE_NEW_ASSET.test(t)) return true;
  if (
    /\b(make me a|create a|create me a|mach mir ein|erstell(?:e|en)? mir ein)\b/i.test(t) &&
    !/\b(current|aktuell|existing|vorhanden|this|that|it|darker|dunkler|remove|entferne)\b/i.test(t)
  ) {
    return true;
  }
  return (
    (/\bmake a (logo|banner|facecam|overlay|image|video)\b/i.test(t) ||
      /\b(erstell(?:e|en)?|generier(?:e|en)?)\b.{0,40}\b(video|logo|banner|ki-video)\b/i.test(t)) &&
    !/\b(darker|dunkler|from this|existing|current|änder|change)\b/i.test(t)
  );
}

export function isModificationUtterance(message: string): boolean {
  const t = String(message ?? '').trim();
  if (!t || isCreateNewAssetUtterance(t)) return false;
  const lower = t.toLowerCase();
  if (/^what exactly will change|^was (genau )?ändert sich|^was wird (genau )?geändert/.test(lower)) return true;
  if (/\b(use the old|nutze das alte|stattdessen)\b/.test(lower) && /\b(logo|banner|facecam|overlay)\b/.test(lower)) {
    return true;
  }
  if (
    /\b(change|änder|remove|entferne|dunkler|darker|heller|brighter|keep everything|only change|nur den text|nur die schrift|don't change|nicht ändern|keep the|behalte|edit)\b/.test(
      lower
    ) ||
    /\b(make it|mach es)\b/.test(lower)
  ) {
    return true;
  }
  if (/\b(fit tiktok|passend (zu )?tiktok)\b/.test(lower)) return true;
  if (
    /\b(9\s*[:x×]\s*16|16\s*[:x×]\s*9)\b/.test(lower) &&
    /\b(change|änder|make this|mach (es|das|dieses)|fit)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

export function wantsModificationSummary(message: string): boolean {
  return /what exactly will change|was (genau )?ändert sich|was wird (genau )?geändert|welche änderungen/i.test(
    String(message ?? '')
  );
}

export function parseModificationChanges(message: string): ModificationChange[] {
  const raw = String(message ?? '').trim();
  const lower = raw.toLowerCase();
  const out: ModificationChange[] = [];

  const replaceNamed = raw.match(
    /change\s+([A-Za-z0-9][A-Za-z0-9_-]{0,40})\s+to\s+([A-Za-z0-9][A-Za-z0-9_-]{0,40})/i
  );
  const namedOk =
    Boolean(replaceNamed) &&
    !/^(only|the|den|die|das|name|text|schrift)$/i.test(replaceNamed![1]!.trim()) &&
    !/\b(text|name|schrift)\b/i.test(replaceNamed![1]!);
  if (namedOk && replaceNamed) {
    out.push({ kind: 'TEXT_REPLACE', from: replaceNamed[1]!.trim(), to: replaceNamed[2]!.trim() });
  }
  const textTo = raw.match(
    /(?:change only the text to|change the (?:name|text) to|text to|schrift (?:zu|auf)|text (?:zu|auf))\s*[„"']?([A-Za-z0-9][A-Za-z0-9_-]{0,40})/i
  );
  if (textTo && !namedOk) {
    out.push({ kind: 'TEXT_REPLACE', to: textTo[1]!.trim() });
  }
  if (/remove the text|entferne den text|text (weg|entfernen)|ohne text/.test(lower)) {
    out.push({ kind: 'TEXT_REMOVE' });
  }
  if (/add (the )?text|füge text/.test(lower) && !textTo) {
    const added = raw.match(/add (?:the )?text\s+[„"']?([^"'?.!]+)/i);
    out.push({ kind: 'TEXT_ADD', to: added?.[1]?.trim() });
  }

  if (/background.{0,24}(transparent|remove)|entferne den hintergrund|hintergrund (weg|entfernen)/.test(lower)) {
    out.push({ kind: 'BACKGROUND_REMOVE' });
  } else if (/background|hintergrund/.test(lower)) {
    const bgColor = lower.match(/background.{0,20}(black|schwarz|white|weiß|weiss|red|rot|blue|blau|darker|dunkler|gold)/);
    out.push({
      kind: 'BACKGROUND_CHANGE',
      value: bgColor?.[1] || (/dunkler|darker/.test(lower) ? 'darker' : undefined),
    });
  }

  if (/\b(darker|dunkler|heller|brighter)\b/.test(lower) && !/background|hintergrund/.test(lower)) {
    out.push({
      kind: /heller|brighter/.test(lower) ? 'BRIGHTNESS_CHANGE' : 'BRIGHTNESS_CHANGE',
      value: /heller|brighter/.test(lower) ? 'brighter' : 'darker',
    });
  }

  if (/\bno red\b|kein rot|ohne rot/.test(lower)) {
    out.push({ kind: 'COLOR_CHANGE', value: 'no-red' });
  } else if (
    /\b(blue|blau|red|rot|gold|green|grün|black|schwarz)\b/.test(lower) &&
    !/background|hintergrund|text to|change only the text/.test(lower)
  ) {
    const color = lower.match(/\b(blue|blau|red|rot|gold|green|grün|black|schwarz)\b/)?.[1];
    if (color && !out.some((c) => c.kind === 'COLOR_CHANGE')) {
      out.push({ kind: 'COLOR_CHANGE', value: color });
    }
  }

  const removeEl = raw.match(/remove the ([a-zA-ZäöüÄÖÜß-]{2,24})|entferne (?:den |die |das )?([a-zA-ZäöüÄÖÜß-]{2,24})/i);
  if (removeEl && !/text|hintergrund|background/.test((removeEl[1] || removeEl[2] || '').toLowerCase())) {
    out.push({ kind: 'ELEMENT_REMOVE', element: (removeEl[1] || removeEl[2] || '').trim() });
  }
  const addEl = raw.match(/add (?:a |the )?([a-zA-ZäöüÄÖÜß-]{2,24})|füge (?:einen |eine |ein )?([a-zA-ZäöüÄÖÜß-]{2,24})/i);
  if (addEl && !/text/.test((addEl[1] || addEl[2] || '').toLowerCase())) {
    out.push({ kind: 'ELEMENT_ADD', element: (addEl[1] || addEl[2] || '').trim() });
  }
  const wolfSmaller = /wolf.{0,16}(smaller|kleiner)|(smaller|kleiner).{0,16}wolf/.test(lower);
  if (wolfSmaller) {
    out.push({ kind: 'RESIZE', element: 'wolf', value: 'smaller' });
  }

  if (/\bcinematic|minimal|retro|neon|dunk(el|le)|esports\b/.test(lower) && /style|stil|more cinematic|cinematic/.test(lower)) {
    const style = lower.match(/\b(cinematic|minimal|retro|neon|esports)\b/)?.[1];
    out.push({ kind: 'STYLE_CHANGE', value: style });
  }

  const aspect = raw.match(/\b(9\s*[:x×]\s*16|16\s*[:x×]\s*9|1\s*[:x×]\s*1)\b/i);
  if (aspect || /fit tiktok|passend (zu )?tiktok/.test(lower)) {
    out.push({
      kind: 'ASPECT_RATIO_CHANGE',
      value: aspect ? aspect[1]!.replace(/\s+/g, '').replace(/[x×]/g, ':') : '9:16',
    });
  }

  if (/\bcrop\b|zuschneiden/.test(lower)) out.push({ kind: 'CROP' });
  if (/\bresize\b|skalier/.test(lower) && !wolfSmaller) out.push({ kind: 'RESIZE' });
  if (/contrast|kontrast/.test(lower)) out.push({ kind: 'CONTRAST_CHANGE' });
  if (/\beffect|effekt|glow|schatten/.test(lower)) out.push({ kind: 'EFFECT_CHANGE' });
  if (/position|verschieb|links|rechts/.test(lower) && /logo|wolf|text|element/.test(lower)) {
    out.push({ kind: 'POSITION_CHANGE' });
  }

  return uniqueChanges(out);
}

export function parsePreserveInstructions(message: string): PreserveInstruction[] {
  const lower = String(message ?? '').toLowerCase();
  const out: PreserveInstruction[] = [];
  if (/only (change )?the text|nur den text|nur die schrift|change only the text/.test(lower)) {
    out.push({ kind: 'all_except', element: 'text' });
  }
  if (/keep everything the same except the background|alles gleich ausser|außer dem hintergrund|except the background/.test(lower)) {
    out.push({ kind: 'all_except', element: 'background' });
  }
  if (/keep the wolf|behalte den wolf|wolf.{0,20}unchanged|don't (change|touch) the wolf|nicht den wolf/.test(lower)) {
    out.push({ kind: 'element', element: 'wolf' });
  }
  if (/don't (change|touch) the (colors|farben)|nicht die farben|keep the colors|farben unverändert|colors unchanged/.test(lower)) {
    out.push({ kind: 'colors' });
  }
  if (/keep the text exactly|text exactly the same|behalte den text/.test(lower)) {
    out.push({ kind: 'text' });
  }
  if (/don't (change|touch) the text|nicht den text|text unverändert/.test(lower) && !/change only the text|text to /.test(lower)) {
    out.push({ kind: 'text' });
  }
  if (/keep the layout|layout unverändert/.test(lower)) out.push({ kind: 'layout' });
  if (/don't change the style|stil unverändert/.test(lower)) out.push({ kind: 'style' });
  return out;
}

export function detectModificationContradictions(
  changes: ModificationChange[],
  preserve: PreserveInstruction[]
): string[] {
  const hits: string[] = [];
  const preserveText = preserve.some((p) => p.kind === 'text');
  const preserveColors = preserve.some((p) => p.kind === 'colors');
  const changesText = changes.some((c) => c.kind === 'TEXT_REPLACE' || c.kind === 'TEXT_ADD' || c.kind === 'TEXT_REMOVE');
  const changesColor = changes.some((c) => c.kind === 'COLOR_CHANGE');
  if (preserveText && changesText) hits.push('text');
  if (preserveColors && changesColor) hits.push('colors');
  return [...new Set(hits)];
}

export function parseModificationIntentMeta(message: string): {
  matchProject: boolean;
  matchDna: boolean;
  replaceCurrent: boolean;
  historicalTarget: boolean;
} {
  const lower = String(message ?? '').toLowerCase();
  return {
    matchProject: /match(es|ing)? (this |the |my )?project|passend zu (diesem |dem )?projekt/.test(lower),
    matchDna: /match(es|ing)? (my |the )?(creator )?dna|passend zur (creator )?dna/.test(lower),
    replaceCurrent: /replace the current|ersetze das aktuelle|als aktuelles/.test(lower),
    historicalTarget: /\b(old|alte[sn]?|historisch|früher|previous)\b/.test(lower),
  };
}

export function modificationPriceStatus(): { defined: false; reason: 'PRICING_DECISION_REQUIRED' } {
  return { defined: false, reason: 'PRICING_DECISION_REQUIRED' };
}

export function buildProviderCapabilitySnapshot(input: {
  imageCreate: boolean;
  imageEditImplemented: boolean;
  videoCreate: boolean;
  videoEditImplemented: boolean;
  audioEditImplemented: boolean;
}): ProviderCapabilitySnapshot {
  return {
    IMAGE_CREATE: input.imageCreate === true,
    IMAGE_EDIT: input.imageEditImplemented === true,
    IMAGE_VARIATION: false,
    IMAGE_INPAINT: false,
    IMAGE_OUTPAINT: false,
    VIDEO_CREATE: input.videoCreate === true,
    VIDEO_EDIT: input.videoEditImplemented === true,
    AUDIO_EDIT: input.audioEditImplemented === true,
  };
}

export function requiredCapabilityForChanges(changes: ModificationChange[]): ProviderCapabilityKind {
  if (changes.some((c) => c.kind === 'ASPECT_RATIO_CHANGE' || c.kind === 'CROP' || c.kind === 'RESIZE')) {
    return 'IMAGE_EDIT';
  }
  return 'IMAGE_EDIT';
}

export function buildModificationRequest(input: {
  userText: string;
  target?: ModificationTarget;
  projectId?: string;
  capability: ProviderCapabilitySnapshot;
  previous?: ModificationSessionState;
}): ModificationRequest {
  const meta = parseModificationIntentMeta(input.userText);
  const extracted = parseModificationChanges(input.userText);
  const preserveNew = parsePreserveInstructions(input.userText);
  const summaryOnly = wantsModificationSummary(input.userText);
  const retargetOnly = meta.historicalTarget && extracted.length === 0 && !summaryOnly;
  let changes: ModificationChange[];
  let mergedPreserve: PreserveInstruction[];
  if (summaryOnly || retargetOnly) {
    changes = extracted.length ? extracted : input.previous?.changes ?? [];
    mergedPreserve = preserveNew.length ? preserveNew : input.previous?.preserve ?? [];
  } else if (extracted.length) {
    changes = extracted;
    mergedPreserve = preserveNew;
  } else {
    changes = input.previous?.changes ?? [];
    mergedPreserve = preserveNew.length ? preserveNew : input.previous?.preserve ?? [];
  }
  const contradictions = detectModificationContradictions(changes, mergedPreserve);
  const missing: string[] = [];
  if (!input.target) missing.push('target');
  if (!changes.length && !wantsModificationSummary(input.userText) && !meta.historicalTarget) {
    missing.push('changes');
  }
  if (contradictions.length) missing.push('contradiction');
  const capabilityKind = requiredCapabilityForChanges(changes);
  const capOk = input.capability[capabilityKind] === true;
  const price = modificationPriceStatus();
  const requiresClarification = missing.length > 0 || contradictions.length > 0;
  const executable = Boolean(input.target && !requiresClarification && capOk && price.defined);
  return {
    projectId: input.target?.projectId ?? input.projectId,
    target: input.target,
    changes,
    preserve: mergedPreserve,
    output: changes.find((c) => c.kind === 'ASPECT_RATIO_CHANGE')
      ? { aspectRatio: changes.find((c) => c.kind === 'ASPECT_RATIO_CHANGE')?.value }
      : undefined,
    userText: input.userText,
    confidence: requiresClarification ? 'LOW' : input.target ? 'HIGH' : 'LOW',
    missingInformation: missing,
    requiresClarification,
    quoteRequired: false,
    executable,
    providerCapability: capabilityKind,
    matchProject: meta.matchProject || input.previous?.matchProject,
    matchDna: meta.matchDna || input.previous?.matchDna,
    replaceCurrent: meta.replaceCurrent || input.previous?.replaceCurrent || false,
    contradictions,
    pricing: price,
  };
}

export function summarizeModification(req: ModificationRequest): string {
  const lines: string[] = [];
  if (req.target) {
    const role = req.target.role || 'Asset';
    const name = req.target.name || role;
    const project = req.projectId ? '' : '';
    lines.push(
      req.target.projectId
        ? `Ziel: ${humanRole(role)} „${name}“ im aktuellen Projekt.`
        : `Ziel: hochgeladenes Bild „${name}“.`
    );
    void project;
  } else {
    lines.push('Ziel: unklar. Welches vorhandene Asset soll geändert werden?');
  }
  if (req.changes.length) {
    lines.push('Geplante Änderungen:');
    for (const change of req.changes) {
      lines.push(`- ${humanChange(change)}`);
    }
  } else {
    lines.push('Geplante Änderungen: noch nicht festgelegt.');
  }
  if (req.preserve.length) {
    lines.push('Unverändert:');
    for (const p of req.preserve) {
      lines.push(`- ${humanPreserve(p)}`);
    }
  } else if (req.changes.length) {
    lines.push('Unverändert: alles, was nicht ausdrücklich genannt wurde.');
  }
  lines.push(req.replaceCurrent ? 'Projekt-Aktuell: würde später ersetzt werden — nur nach Bestätigung.' : 'Projekt-Aktuell: wird nicht still ersetzt.');
  if (req.matchProject) lines.push('Projektgestaltung wird nur verwendet, weil du eine Anpassung an das Projekt angefragt hast.');
  else if (req.matchDna) lines.push('Creator DNA wird nur verwendet, weil du eine Anpassung an die DNA angefragt hast.');
  else lines.push('Bestehendes Asset bleibt maßgeblich. DNA und Projektgestaltung werden nicht still umgestaltet.');
  if (req.contradictions.length) {
    lines.push('Widerspruch: Bitte kläre, was gelten soll. Ich wähle nicht still.');
  }
  if (!req.executable) {
    lines.push('Ausführung derzeit nicht verfügbar. Es wird nichts generiert und nichts abgebucht.');
  }
  return lines.join('\n');
}

export function toModificationSessionState(req: ModificationRequest): ModificationSessionState | undefined {
  if (!req.target) return undefined;
  return {
    targetAssetId: req.target.assetId,
    targetFileId: req.target.fileId,
    targetRole: req.target.role,
    targetProjectId: req.target.projectId,
    targetName: req.target.name,
    targetSource: req.target.source,
    changes: req.changes,
    preserve: req.preserve,
    replaceCurrent: req.replaceCurrent,
    matchProject: req.matchProject,
    matchDna: req.matchDna,
  };
}

export function assertSafeLineage(input: {
  parentAssetId?: string;
  childAssetId?: string;
  parentFileId?: string;
  childFileId?: string;
  parentOwnerId?: string;
  childOwnerId?: string;
}): { ok: true } | { ok: false; reason: string } {
  if (input.childAssetId && input.parentAssetId && input.childAssetId === input.parentAssetId) {
    return { ok: false, reason: 'CIRCULAR_LINEAGE' };
  }
  if (input.childFileId && input.parentFileId && input.childFileId === input.parentFileId) {
    return { ok: false, reason: 'ORIGINAL_OVERWRITE' };
  }
  if (input.parentOwnerId && input.childOwnerId && input.parentOwnerId !== input.childOwnerId) {
    return { ok: false, reason: 'FOREIGN_LINEAGE' };
  }
  if (!input.childFileId || (input.parentFileId && input.childFileId === input.parentFileId)) {
    return { ok: false, reason: 'NEW_FILE_REQUIRED' };
  }
  return { ok: true };
}

function uniqueChanges(rows: ModificationChange[]): ModificationChange[] {
  const seen = new Set<string>();
  const next: ModificationChange[] = [];
  for (const row of rows) {
    const key = `${row.kind}:${row.from ?? ''}:${row.to ?? ''}:${row.element ?? ''}:${row.value ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(row);
  }
  return next;
}

function humanRole(role: string): string {
  if (role === 'logo') return 'aktuelles Logo';
  if (role === 'banner') return 'aktuelles Banner';
  if (role === 'facecam') return 'aktuelle Facecam';
  if (role === 'overlay') return 'aktuelles Overlay';
  return 'aktuelles Asset';
}

function humanChange(change: ModificationChange): string {
  switch (change.kind) {
    case 'TEXT_REPLACE':
      return change.from
        ? `Schrift von „${change.from}“ zu „${change.to}“`
        : `Schrift wird zu „${change.to}“ geändert`;
    case 'TEXT_REMOVE':
      return 'Text wird entfernt';
    case 'TEXT_ADD':
      return `Text „${change.to ?? ''}“ wird ergänzt`;
    case 'BACKGROUND_CHANGE':
      return change.value ? `Hintergrund: ${change.value}` : 'Hintergrund wird angepasst';
    case 'BACKGROUND_REMOVE':
      return 'Hintergrund wird entfernt';
    case 'COLOR_CHANGE':
      return change.value ? `Farbe: ${change.value}` : 'Farbe wird angepasst';
    case 'ELEMENT_REMOVE':
      return `${change.element ?? 'Element'} wird entfernt (Anfrage, keine Objekterkennung)`;
    case 'ELEMENT_ADD':
      return `${change.element ?? 'Element'} soll ergänzt werden`;
    case 'BRIGHTNESS_CHANGE':
      return change.value === 'brighter' ? 'Helligkeit erhöhen' : 'dunkler machen';
    case 'ASPECT_RATIO_CHANGE':
      return `Seitenverhältnis ${change.value ?? ''}`.trim();
    case 'STYLE_CHANGE':
      return `Stil: ${change.value ?? 'angepasst'}`;
    case 'RESIZE':
      return change.element ? `${change.element} ${change.value ?? 'skalieren'}` : 'Größe anpassen';
    default:
      return 'visuelle Anpassung';
  }
}

function humanPreserve(p: PreserveInstruction): string {
  if (p.kind === 'all_except') return `alles außer ${p.element}`;
  if (p.element) return p.element;
  if (p.kind === 'colors') return 'Farben';
  if (p.kind === 'text') return 'Text';
  if (p.kind === 'layout') return 'Layout';
  if (p.kind === 'style') return 'Stil';
  return p.kind;
}
