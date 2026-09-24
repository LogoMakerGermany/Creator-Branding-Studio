/**
 * Modification Assistant (V.0) — target resolution, capability, quote binding.
 * No provider calls. No invented Coin price. No original overwrite.
 */
import type {
  ModificationChange,
  ModificationRequest,
  ModificationSessionState,
  ModificationTarget,
  PreserveInstruction,
  ProjectAsset,
  ProjectAssetRole,
  ProviderCapabilitySnapshot,
} from '@ucbs/shared';
import {
  assertSafeLineage,
  buildModificationRequest,
  buildProviderCapabilitySnapshot,
  parseProjectAssetRoleFromText,
  summarizeModification,
  toModificationSessionState,
} from '@ucbs/shared';
import { ServiceError } from '../lib/errors.js';
import { hasImageAiProvider, hasVideoAiProvider } from '../config/env.js';
import { getUserFile } from './file-cloud.service.js';
import { getProject } from './project.service.js';
import { listProjectAssets, resolveCurrentProjectAsset, resolveProjectAssetReference } from './project-memory.service.js';

export function currentProviderCapabilitySnapshot(): ProviderCapabilitySnapshot {
  return buildProviderCapabilitySnapshot({
    imageCreate: hasImageAiProvider(),
    imageEditImplemented: false,
    videoCreate: hasVideoAiProvider(),
    videoEditImplemented: false,
    audioEditImplemented: false,
  });
}

export type ModificationTargetResult =
  | { status: 'resolved'; target: ModificationTarget; asset?: ProjectAsset }
  | { status: 'none' }
  | { status: 'ambiguous'; message: string }
  | { status: 'rejected'; reason: 'FOREIGN' | 'DELETED' | 'UNAVAILABLE' | 'SIGNED_URL'; message: string };

export async function resolveModificationTarget(input: {
  userId: string;
  message: string;
  projectId?: string;
  attachedFileId?: string;
  lastReferencedProjectId?: string;
  lastReferencedAssetRole?: string;
  lastReferencedAssetId?: string;
  previous?: ModificationSessionState;
  historical?: boolean;
}): Promise<ModificationTargetResult> {
  const message = String(input.message ?? '');
  if (/https?:\/\/\S+/i.test(message) && !input.attachedFileId && !/\bfile(?:[- ]?id)\b/i.test(message)) {
    if (/signed|storage\.googleapis|replicate\.|oaidalleapiprod/i.test(message)) {
      return {
        status: 'rejected',
        reason: 'SIGNED_URL',
        message: 'Eine Signatur- oder Provider-URL ist kein Eigentumsnachweis. Ich ändere das nicht.',
      };
    }
  }

  if (input.attachedFileId) {
    const owned = await getUserFile(input.attachedFileId, input.userId);
    if (!owned) {
      return {
        status: 'rejected',
        reason: 'FOREIGN',
        message: 'Diese Datei gehört nicht zu deinem Konto oder ist nicht verfügbar.',
      };
    }
    return {
      status: 'resolved',
      target: {
        fileId: owned.id,
        source: 'upload',
        name: owned.name,
        availability: 'available',
      },
    };
  }

  const role =
    parseProjectAssetRoleFromText(message) ||
    (input.historical ? (input.previous?.targetRole as ProjectAssetRole | undefined) : undefined);
  const versionMatch = message.match(/\bv(?:ersion)?\s*(\d+)\b/i);
  const version = versionMatch ? Number(versionMatch[1]) : undefined;
  const explicitAssetId = message.match(/\basset(?:[- ]?id)?\s*[:=]?\s*([0-9a-f-]{36})\b/i)?.[1];
  const historical = Boolean(input.historical) || /\b(old|alte[sn]?|historisch|früher|previous)\b/i.test(message);
  const currentCue = /\b(current|aktuell)\b/i.test(message);
  const projectId = input.projectId;
  const namedRole = Boolean(parseProjectAssetRoleFromText(message));

  if (explicitAssetId && projectId && role) {
    const check = await resolveProjectAssetReference(input.userId, projectId, role, { assetId: explicitAssetId });
    return fromAssetCheck(check, 'explicit_asset', projectId);
  }

  if (projectId && role && version != null) {
    const check = await resolveProjectAssetReference(input.userId, projectId, role, { version });
    return fromAssetCheck(check, 'explicit_version', projectId);
  }

  if (projectId && role && historical) {
    return resolveRoleTarget(input.userId, projectId, role, true);
  }

  if (projectId && role && (currentCue || namedRole)) {
    return resolveRoleTarget(input.userId, projectId, role, false);
  }

  if (
    input.lastReferencedAssetId &&
    input.lastReferencedProjectId &&
    (!projectId || input.lastReferencedProjectId === projectId)
  ) {
    const refRole = (input.lastReferencedAssetRole || role) as ProjectAssetRole | undefined;
    if (refRole) {
      const check = await resolveProjectAssetReference(input.userId, input.lastReferencedProjectId, refRole, {
        assetId: input.lastReferencedAssetId,
      });
      if (!check.ok) {
        return {
          status: 'rejected',
          reason: check.reason === 'UNAVAILABLE' || check.reason === 'FOREIGN_FILE' ? 'UNAVAILABLE' : 'DELETED',
          message: 'Die vorherige Asset-Referenz ist nicht mehr gültig. Welches vorhandene Asset soll geändert werden?',
        };
      }
      return fromAssetCheck(check, 'session_referent', input.lastReferencedProjectId);
    }
  }

  if (projectId && role) {
    return resolveRoleTarget(input.userId, projectId, role, historical);
  }

  if (input.previous?.targetAssetId && input.previous.targetProjectId && input.previous.targetRole) {
    if (projectId && input.previous.targetProjectId !== projectId) {
      return { status: 'none' };
    }
    const check = await resolveProjectAssetReference(
      input.userId,
      input.previous.targetProjectId,
      input.previous.targetRole as ProjectAssetRole,
      { assetId: input.previous.targetAssetId }
    );
    return fromAssetCheck(check, input.previous.targetSource ?? 'session_referent', input.previous.targetProjectId);
  }

  if (input.previous?.targetFileId && !input.previous.targetProjectId) {
    const owned = await getUserFile(input.previous.targetFileId, input.userId);
    if (!owned) {
      return {
        status: 'rejected',
        reason: 'DELETED',
        message: 'Die hochgeladene Zieldatei ist nicht mehr verfügbar.',
      };
    }
    return {
      status: 'resolved',
      target: {
        fileId: owned.id,
        source: 'upload',
        name: owned.name,
        availability: 'available',
      },
    };
  }

  return { status: 'none' };
}

async function resolveRoleTarget(
  userId: string,
  projectId: string,
  role: ProjectAssetRole,
  historical: boolean
): Promise<ModificationTargetResult> {
  const state = await resolveCurrentProjectAsset(userId, projectId, role);
  if (historical) {
    if (state.historical.length > 1) {
      return {
        status: 'ambiguous',
        message: `Es gibt mehrere historische ${role}-Versionen. Welche meinst du? Ich rate nicht.`,
      };
    }
    if (state.historical.length === 1 && state.historical[0]) {
      const asset = state.historical[0];
      if (asset.availability === 'unavailable' || asset.availability === 'missing') {
        return {
          status: 'rejected',
          reason: 'UNAVAILABLE',
          message: `Diese historische ${role}-Datei ist nicht verfügbar.`,
        };
      }
      return {
        status: 'resolved',
        target: {
          assetId: asset.id,
          fileId: asset.fileId,
          role,
          source: 'explicit_version',
          projectId,
          name: asset.name,
          availability: 'available',
        },
        asset,
      };
    }
    return { status: 'none' };
  }
  if (state.state === 'CURRENT_AVAILABLE' && state.current) {
    return {
      status: 'resolved',
      target: {
        assetId: state.current.id,
        fileId: state.current.fileId,
        role,
        source: 'project_current',
        projectId,
        name: state.current.name,
        availability: 'available',
      },
      asset: state.current,
    };
  }
  if (state.state === 'CURRENT_UNAVAILABLE' && state.current) {
    return {
      status: 'rejected',
      reason: 'UNAVAILABLE',
      message: `Das aktuelle ${role} ist gespeichert, aber die Datei ist nicht verfügbar.`,
    };
  }
  return { status: 'none' };
}

function fromAssetCheck(
  check: Awaited<ReturnType<typeof resolveProjectAssetReference>>,
  source: ModificationTarget['source'],
  projectId: string
): ModificationTargetResult {
  if (!check.ok) {
    if (check.reason === 'FOREIGN_FILE' || check.reason === 'NOT_FOUND') {
      return {
        status: 'rejected',
        reason: check.reason === 'FOREIGN_FILE' ? 'FOREIGN' : 'DELETED',
        message: 'Dieses Ziel gehört nicht zu deinem Konto oder existiert nicht.',
      };
    }
    return {
      status: 'rejected',
      reason: 'UNAVAILABLE',
      message: 'Dieses Ziel ist nicht verfügbar.',
    };
  }
  return {
    status: 'resolved',
    target: {
      assetId: check.asset.id,
      fileId: check.asset.fileId ?? check.ref.fileId,
      role: check.ref.role,
      source,
      projectId,
      name: check.asset.name,
      availability: 'available',
    },
    asset: check.asset,
  };
}

export function buildModificationQuotePayload(req: ModificationRequest): Record<string, unknown> {
  return {
    operation: 'MODIFY_ASSET',
    executable: false,
    quoteRequired: false,
    projectId: req.projectId,
    target: req.target,
    changes: req.changes,
    preserve: req.preserve,
    replaceCurrent: req.replaceCurrent === true,
    matchProject: req.matchProject === true,
    matchDna: req.matchDna === true,
    pricing: req.pricing,
    providerCapability: req.providerCapability,
  };
}

export function isModificationQuoteExecutable(payload: Record<string, unknown> | undefined): boolean {
  if (!payload || payload.operation !== 'MODIFY_ASSET') return false;
  if (payload.executable === true) return false;
  return false;
}

export async function revalidateModificationPreconditions(
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const target = payload.target as ModificationTarget | undefined;
  if (!target) {
    throw new ServiceError(400, 'MODIFICATION_NO_TARGET', 'Kein gültiges Änderungsziel.');
  }
  if (payload.projectId && typeof payload.projectId === 'string') {
    const project = await getProject(payload.projectId, userId);
    if (!project || project.deletedAt) {
      throw new ServiceError(403, 'FOREIGN_PROJECT', 'Dieses Projekt gehört nicht zu deinem Konto.');
    }
  }
  if (target.projectId) {
    const project = await getProject(target.projectId, userId);
    if (!project || project.deletedAt) {
      throw new ServiceError(403, 'FOREIGN_PROJECT', 'Dieses Projekt gehört nicht zu deinem Konto.');
    }
    if (target.assetId && target.role) {
      const check = await resolveProjectAssetReference(userId, target.projectId, target.role as ProjectAssetRole, {
        assetId: target.assetId,
      });
      if (!check.ok) {
        throw new ServiceError(
          403,
          check.reason === 'FOREIGN_FILE' ? 'FOREIGN_ASSET' : 'ASSET_UNAVAILABLE',
          'Dieses Ziel ist nicht mehr gültig.'
        );
      }
    }
  }
  if (target.fileId) {
    const owned = await getUserFile(target.fileId, userId);
    if (!owned) {
      throw new ServiceError(403, 'FOREIGN_FILE', 'Die Zieldatei gehört nicht zu deinem Konto oder ist gelöscht.');
    }
  }
  const cap = currentProviderCapabilitySnapshot();
  const needed = String(payload.providerCapability ?? 'IMAGE_EDIT') as keyof ProviderCapabilitySnapshot;
  if (cap[needed] !== true) {
    throw new ServiceError(409, 'MODIFICATION_UNAVAILABLE', 'Diese Bearbeitung ist derzeit nicht ausführbar.');
  }
  throw new ServiceError(409, 'PRICING_DECISION_REQUIRED', 'Für Änderungen ist kein Coin-Preis festgelegt.');
}

export function futureNonDestructiveResult(input: {
  parentAssetId: string;
  parentFileId: string;
  childAssetId: string;
  childFileId: string;
  parentOwnerId: string;
  childOwnerId: string;
}): { ok: true } | { ok: false; reason: string } {
  return assertSafeLineage(input);
}

export async function prepareModificationRequest(input: {
  userId: string;
  message: string;
  projectId?: string;
  attachedFileId?: string;
  lastReferencedProjectId?: string;
  lastReferencedAssetRole?: string;
  lastReferencedAssetId?: string;
  previous?: ModificationSessionState;
  historical?: boolean;
}): Promise<{
  request: ModificationRequest;
  targetResult: ModificationTargetResult;
  summary: string;
}> {
  const targetResult = await resolveModificationTarget(input);
  const target = targetResult.status === 'resolved' ? targetResult.target : undefined;
  const request = buildModificationRequest({
    userText: input.message,
    target,
    projectId: target?.projectId ?? input.projectId,
    capability: currentProviderCapabilitySnapshot(),
    previous: input.previous,
  });
  if (targetResult.status === 'ambiguous') {
    request.requiresClarification = true;
    request.missingInformation = [...new Set([...request.missingInformation, 'target'])];
    request.executable = false;
  }
  if (targetResult.status === 'rejected') {
    request.requiresClarification = true;
    request.missingInformation = [...new Set([...request.missingInformation, 'target'])];
    request.executable = false;
  }
  if (looksLikeVideoEdit(input.message, target)) {
    request.providerCapability = 'VIDEO_EDIT';
    request.executable = false;
  }
  if (looksLikeAudioEdit(input.message, target)) {
    request.providerCapability = 'AUDIO_EDIT';
    request.executable = false;
  }
  return { request, targetResult, summary: summarizeModification(request) };
}

export function modificationUserReply(input: {
  request: ModificationRequest;
  targetResult: ModificationTargetResult;
  summaryMode?: boolean;
}): string {
  const { request, targetResult } = input;
  if (targetResult.status === 'rejected') return targetResult.message;
  if (targetResult.status === 'ambiguous') return targetResult.message;
  if (input.summaryMode) return summarizeModification(request);

  const lines: string[] = [];
  if (!request.target) {
    const role = parseProjectAssetRoleFromText(input.request.userText);
    if (role) {
      return `Ich finde kein eindeutiges aktuelles ${role} in diesem Projekt. Welches meinst du?`;
    }
    lines.push('Welches vorhandene Asset soll geändert werden? Ich rate nicht und erstelle nichts Neues.');
    return lines.join('\n');
  }
  if (request.target.projectId) {
    lines.push(
      `Ich ändere ${humanTarget(request.target)} — nur vorbereitet, ohne Ausführung und ohne Abbuchung.`
    );
  } else {
    lines.push('Ich nutze deine hochgeladene Datei als Ziel. Sie wird dem Projekt nicht automatisch zugeordnet.');
  }
  if (request.contradictions.length) {
    lines.push('Das widerspricht sich. Was soll gelten? Ich wähle nicht still.');
    return lines.join('\n');
  }
  if (!request.changes.length) {
    lines.push('Was genau soll sich ändern? Farbe, Text, Hintergrund oder etwas anderes?');
  } else {
    lines.push(summarizeModification(request));
  }
  if (request.providerCapability === 'VIDEO_EDIT') {
    lines.push('Video-Erstellung ist nicht dasselbe wie Video-Bearbeitung. Bearbeitung ist derzeit nicht verfügbar.');
  } else if (request.providerCapability === 'AUDIO_EDIT') {
    lines.push('Audio-Bearbeitung ist derzeit nicht verfügbar.');
  } else if (!currentProviderCapabilitySnapshot().IMAGE_EDIT) {
    lines.push('Bildbearbeitung ist derzeit nicht ausführbar. Es gibt keinen festgelegten Änderungspreis.');
  }
  if (!request.replaceCurrent) {
    lines.push('Das aktuelle Projekt-Asset wird nicht still ersetzt.');
  }
  return lines.join('\n');
}

export { toModificationSessionState, summarizeModification };
export type { ModificationChange, PreserveInstruction };

function humanTarget(target: ModificationTarget): string {
  if (target.role === 'banner') return `dein aktuelles Banner${target.name ? ` „${target.name}“` : ''}`;
  if (target.role === 'logo') return `dein aktuelles Logo${target.name ? ` „${target.name}“` : ''}`;
  if (target.name) return `„${target.name}“`;
  return 'dieses Asset';
}

function looksLikeVideoEdit(message: string, target?: ModificationTarget): boolean {
  return /video/.test(message.toLowerCase()) || target?.role === 'video';
}

function looksLikeAudioEdit(message: string, target?: ModificationTarget): boolean {
  return /\b(audio|musik|music|voice|tts)\b/.test(message.toLowerCase()) || target?.role === 'audio';
}

export async function listOwnedProjectAssetsBounded(userId: string, projectId: string): Promise<ProjectAsset[]> {
  return listProjectAssets(userId, projectId);
}
