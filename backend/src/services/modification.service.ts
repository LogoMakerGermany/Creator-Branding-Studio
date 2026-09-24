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
  buildImageEditPrompt,
  buildModificationRequest,
  buildProviderCapabilitySnapshot,
  COIN_COSTS,
  CoinSpendCategory,
  imageEditWantsTransparency,
  modificationPriceStatus,
  parseProjectAssetRoleFromText,
  summarizeModification,
  toModificationSessionState,
} from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import { ServiceError } from '../lib/errors.js';
import { hasImageAiProvider, hasImageEditProvider, hasVideoAiProvider } from '../config/env.js';
import { getUserFile, readOwnedImageBytes, saveGeneratedAssetFromBuffer } from './file-cloud.service.js';
import { getProject } from './project.service.js';
import { listProjectAssets, linkAssetToProject, resolveCurrentProjectAsset, resolveProjectAssetReference } from './project-memory.service.js';
import { looksLikePathInjection, sniffRasterImageMime } from '../lib/upload-validation.js';
import {
  assertAllowedImageEditModel,
  editGptImage,
  OPENAI_GPT_IMAGE_EDIT_MODEL,
} from '../lib/openai-image-edit.js';
import { withCoinCharge } from '../lib/billable-job.js';
import { AppError } from '../middleware/errorHandler.js';
import { recordApiCost, API_COST_KIND_ESTIMATE } from '../lib/api-cost.js';
import { saveJob, type GenerationJob } from './ai.service.js';
import { resolveDnaForRequest } from './dna.service.js';
import type { NexterQuote } from '@ucbs/shared';

export function currentProviderCapabilitySnapshot(): ProviderCapabilitySnapshot {
  return buildProviderCapabilitySnapshot({
    imageCreate: hasImageAiProvider(),
    imageEditImplemented: hasImageEditProvider(),
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
    executable: req.executable === true,
    quoteRequired: req.executable === true,
    projectId: req.projectId,
    target: req.target,
    changes: req.changes,
    preserve: req.preserve,
    replaceCurrent: req.replaceCurrent === true,
    matchProject: req.matchProject === true,
    matchDna: req.matchDna === true,
    pricing: req.pricing,
    providerCapability: req.providerCapability ?? 'IMAGE_EDIT',
    userText: req.userText,
    output: req.output,
  };
}

export function isModificationQuoteExecutable(payload: Record<string, unknown> | undefined): boolean {
  if (!payload || payload.operation !== 'MODIFY_ASSET') return false;
  if (payload.providerCapability !== 'IMAGE_EDIT') return false;
  return payload.executable === true;
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
  const maskFileId = typeof payload.maskFileId === 'string' ? payload.maskFileId : undefined;
  if (maskFileId) {
    if (looksLikePathInjection(maskFileId) || !/^[0-9a-f-]{36}$/i.test(maskFileId)) {
      throw new ServiceError(400, 'INVALID_MASK', 'Die Maske ist ungültig.');
    }
    const maskOwned = await getUserFile(maskFileId, userId);
    if (!maskOwned) {
      throw new ServiceError(400, 'INVALID_MASK', 'Die Maske ist ungültig.');
    }
  }
  const cap = currentProviderCapabilitySnapshot();
  const needed = String(payload.providerCapability ?? 'IMAGE_EDIT') as keyof ProviderCapabilitySnapshot;
  if (needed === 'VIDEO_EDIT' || needed === 'AUDIO_EDIT') {
    throw new ServiceError(409, 'MODIFICATION_UNAVAILABLE', 'Diese Bearbeitung ist derzeit nicht ausführbar.');
  }
  if (cap[needed] !== true) {
    throw new ServiceError(409, 'MODIFICATION_UNAVAILABLE', 'Diese Bearbeitung ist derzeit nicht ausführbar.');
  }
  if (!hasImageEditProvider()) {
    throw new ServiceError(409, 'MODIFICATION_UNAVAILABLE', 'Diese Bearbeitung ist derzeit nicht ausführbar.');
  }
  assertAllowedImageEditModel(
    typeof payload.model === 'string' ? payload.model : OPENAI_GPT_IMAGE_EDIT_MODEL
  );
  const price = modificationPriceStatus();
  if (!price.defined) {
    throw new ServiceError(409, 'PRICING_DECISION_REQUIRED', 'Für Änderungen ist kein Coin-Preis festgelegt.');
  }
  if (typeof payload.coinCost === 'number' && payload.coinCost !== price.coins) {
    throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
  }
}

function pngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192) return null;
  return { width, height };
}

function asChangeList(raw: unknown): ModificationChange[] {
  return Array.isArray(raw) ? (raw as ModificationChange[]) : [];
}

function asPreserveList(raw: unknown): PreserveInstruction[] {
  return Array.isArray(raw) ? (raw as PreserveInstruction[]) : [];
}

export async function executeQuotedImageEdit(
  userId: string,
  quote: NexterQuote
): Promise<{
  job: GenerationJob;
  coinsSpent: number;
  newBalance: number;
  fileId: string;
  assetId?: string;
}> {
  const payload = quote.payload ?? {};
  if (quote.kind !== 'image-edit' || payload.operation !== 'MODIFY_ASSET') {
    throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist keine Bildbearbeitung.');
  }
  await revalidateModificationPreconditions(userId, payload);
  const serverCost = COIN_COSTS[CoinSpendCategory.IMAGE_EDIT];
  if (quote.coinCost !== serverCost) {
    throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
  }
  if (typeof payload.model === 'string') {
    assertAllowedImageEditModel(payload.model);
  }
  const target = payload.target as ModificationTarget;
  const fileId = typeof target.fileId === 'string' ? target.fileId : undefined;
  if (!fileId) {
    throw new ServiceError(400, 'MODIFICATION_NO_TARGET', 'Kein gültiges Änderungsziel.');
  }

  const source = await readOwnedImageBytes(userId, fileId);
  let mask: Buffer | undefined;
  const maskFileId = typeof payload.maskFileId === 'string' ? payload.maskFileId : undefined;
  if (maskFileId) {
    if (looksLikePathInjection(maskFileId) || !/^[0-9a-f-]{36}$/i.test(maskFileId)) {
      throw new ServiceError(400, 'INVALID_MASK', 'Die Maske ist ungültig.');
    }
    const maskOwned = await readOwnedImageBytes(userId, maskFileId);
    if (maskOwned.mimeType !== 'image/png' || sniffRasterImageMime(maskOwned.buffer) !== 'image/png') {
      throw new ServiceError(400, 'INVALID_MASK', 'Die Maske ist ungültig.');
    }
    const sourceSize = pngDimensions(source.buffer);
    const maskSize = pngDimensions(maskOwned.buffer);
    if (!sourceSize || !maskSize || sourceSize.width !== maskSize.width || sourceSize.height !== maskSize.height) {
      throw new ServiceError(400, 'INVALID_MASK', 'Die Maske ist ungültig.');
    }
    mask = maskOwned.buffer;
  }

  const changes = asChangeList(payload.changes);
  const preserve = asPreserveList(payload.preserve);
  const userText = typeof payload.userText === 'string' ? payload.userText : '';
  const matchProject = payload.matchProject === true;
  const matchDna = payload.matchDna === true;
  let projectStyleHint: string | undefined;
  let dnaStyleHint: string | undefined;
  if (matchProject && target.projectId) {
    const project = await getProject(target.projectId, userId);
    if (project?.name) projectStyleHint = `project "${project.name}"`;
  }
  if (matchDna) {
    const { dna } = await resolveDnaForRequest(userId, target.projectId);
    if (dna) {
      const colors = Array.isArray(dna.primaryColors) ? dna.primaryColors.join(', ') : '';
      dnaStyleHint = [dna.styleDirection, colors].filter(Boolean).join(' ');
    }
  }
  const prompt = buildImageEditPrompt({
    userText,
    changes,
    preserve,
    matchProject,
    matchDna,
    projectStyleHint,
    dnaStyleHint,
  });
  const aspect =
    changes.find((c) => c.kind === 'ASPECT_RATIO_CHANGE')?.value ||
    (payload.output && typeof payload.output === 'object' && typeof (payload.output as { aspectRatio?: unknown }).aspectRatio === 'string'
      ? (payload.output as { aspectRatio: string }).aspectRatio
      : undefined);
  const background = imageEditWantsTransparency({
    role: typeof target.role === 'string' ? target.role : undefined,
    changes,
    userText,
  })
    ? 'transparent'
    : 'opaque';

  try {
    const charged = await withCoinCharge(
      userId,
      CoinSpendCategory.IMAGE_EDIT,
      'Bildbearbeitung',
      async () => {
        const edited = await editGptImage({
          sourceImage: source.buffer,
          sourceMimeType: source.mimeType,
          prompt,
          mask,
          size: aspect,
          background,
        });
        const persisted = await saveGeneratedAssetFromBuffer(userId, 'image-edit', edited.buffer, {
          mimeType: 'image/png',
          projectId: target.projectId,
          sourceAssetId: target.assetId,
          name: `${source.file.name || 'image'}-edit.png`,
        });
        if (!persisted) {
          throw new ServiceError(502, 'PROVIDER_INVALID_PAYLOAD', 'Die Bildbearbeitung lieferte kein gültiges Bild. Coins wurden erstattet.');
        }
        const lineage = assertSafeLineage({
          parentFileId: fileId,
          childFileId: persisted.id,
          parentOwnerId: userId,
          childOwnerId: userId,
        });
        if (!lineage.ok) {
          throw new ServiceError(409, 'UNSAFE_LINEAGE', 'Die Bearbeitung konnte nicht sicher zugeordnet werden. Coins wurden erstattet.');
        }

        let resultAssetId: string | undefined;
        if (target.projectId && target.role) {
          const parent = target.assetId
            ? (await listProjectAssets(userId, target.projectId)).find((a) => a.id === target.assetId)
            : undefined;
          const linked = await linkAssetToProject(userId, target.projectId, {
            name: `${(parent?.name || source.file.name || String(target.role)).slice(0, 80)} · ${persisted.id.slice(0, 8)}`,
            fileId: persisted.id,
            role: target.role as ProjectAssetRole,
            parentAssetId: target.assetId,
            makeCurrent: payload.replaceCurrent === true,
            version: (parent?.version ?? 1) + 1,
            sourceType: 'generation',
            mimeType: 'image/png',
            size: persisted.size,
          });
          resultAssetId = linked.id;
          const childLineage = assertSafeLineage({
            parentAssetId: target.assetId,
            childAssetId: linked.id,
            parentFileId: fileId,
            childFileId: persisted.id,
            parentOwnerId: userId,
            childOwnerId: userId,
          });
          if (!childLineage.ok) {
            throw new ServiceError(409, 'UNSAFE_LINEAGE', 'Die Bearbeitung konnte nicht sicher zugeordnet werden. Coins wurden erstattet.');
          }
        }

        const job: GenerationJob = {
          id: randomUUID(),
          userId,
          module: 'image-edit',
          status: 'completed',
          prompt,
          provider: 'openai',
          quoteId: quote.id,
          fileId: persisted.id,
          projectId: target.projectId,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          mimeType: 'image/png',
          metadata: {
            parentFileId: fileId,
            parentAssetId: target.assetId,
            resultAssetId,
            coinPrice: serverCost,
            model: OPENAI_GPT_IMAGE_EDIT_MODEL,
          },
        };
        await saveJob(job);
        const usageNote = edited.usage
          ? `OpenAI usage tokens input=${edited.usage.input_tokens ?? 'n/a'} output=${edited.usage.output_tokens ?? 'n/a'} total=${edited.usage.total_tokens ?? 'n/a'}. Dollar cost unknown — estimate label only.`
          : 'OpenAI did not return usage. Dollar cost unknown — not claimed as actual.';
        await recordApiCost({
          userId,
          module: 'image-edit',
          provider: 'openai',
          model: OPENAI_GPT_IMAGE_EDIT_MODEL,
          jobId: job.id,
          internalCostCents: 0,
          costKind: API_COST_KIND_ESTIMATE,
          actualProviderCostUnknown: true,
          estimatedCreditsNote: usageNote,
        });
        return job;
      },
      { quoteId: quote.id }
    );
    const fileIdOut = charged.job.fileId;
    if (!fileIdOut) {
      throw new ServiceError(502, 'PROVIDER_INVALID_PAYLOAD', 'Die Bildbearbeitung lieferte kein gültiges Bild. Coins wurden erstattet.');
    }
    return {
      job: charged.job,
      coinsSpent: charged.coinsSpent,
      newBalance: charged.newBalance,
      fileId: fileIdOut,
      assetId: typeof charged.job.metadata?.resultAssetId === 'string' ? charged.job.metadata.resultAssetId : undefined,
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw new ServiceError(err.statusCode, err.code, err.message);
    }
    throw err;
  }
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
    lines.push('Bildbearbeitung ist derzeit nicht ausführbar.');
  } else if (request.executable && request.pricing.defined) {
    lines.push(`Preis: ${request.pricing.coins} Coins. Startet erst nach Bestätigung.`);
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
