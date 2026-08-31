import { CoinSpendCategory } from '@ucbs/shared';
import type { CreatorDNA, UltimateCreatorWizardInput, UltimateCreatorProject } from '@ucbs/shared';
import { wizardToLogoOptions, ULTIMATE_PACK_V1 } from '@ucbs/shared';
import { getActiveDna } from '../dna.service.js';
import { withCoinChargePack } from '../../lib/billable-job.js';
import { runMagikLogoJobs, runGenerationJob } from '../ai.service.js';
import {
  buildBrandingPackPrompt,
  buildBannerPrompt,
  buildFacecamPrompt,
  buildOverlayPrompt,
} from '../studio-prompt.service.js';
import { createUltimateProject, saveUltimateProject } from './project.service.js';
import { ServiceError } from '../../lib/errors.js';

function packStyleSuffix(wizard: UltimateCreatorWizardInput): string {
  return `. Unified Ultimate Creator brand for "${wizard.name}": ${wizard.style} style, colors ${wizard.colors.join(', ')}, game ${wizard.game ?? 'gaming'}. Identical design language, premium esports quality.`;
}

function promptForPackKey(dna: CreatorDNA, key: string, wizard: UltimateCreatorWizardInput): string {
  const suffix = packStyleSuffix(wizard);
  switch (key) {
    case 'profile-pic':
      return buildBrandingPackPrompt(dna, 'profile-pic') + suffix;
    case 'banner-twitch':
      return buildBannerPrompt(dna, { platform: 'twitch', title: wizard.name }) + suffix;
    case 'banner-youtube':
      return buildBannerPrompt(dna, { platform: 'youtube', title: wizard.name }) + suffix;
    case 'discord-banner':
      return buildBannerPrompt(dna, { platform: 'discord', title: wizard.name }) + suffix;
    case 'facecam':
      return buildFacecamPrompt(dna, { transparentBackground: true }) + suffix;
    case 'overlay':
      return buildOverlayPrompt(dna, { overlayType: 'hud', transparentBackground: true }) + suffix;
    case 'panel':
      return buildOverlayPrompt(dna, { overlayType: 'panel', transparentBackground: true }) + suffix;
    default:
      return buildBrandingPackPrompt(dna, key) + suffix;
  }
}

function sizeForPackKey(key: string): '1024x1024' | '1792x1024' | '1024x1792' {
  if (key.startsWith('banner') || key === 'discord-banner') return '1792x1024';
  if (key === 'overlay' || key === 'panel') return '1792x1024';
  return '1024x1024';
}

/** Creator in 60 Sekunden — ein Coin-Abzug, MAGIK-Logo + 7 Assets */
export async function runUltimateCreatorPack(userId: string, wizard: UltimateCreatorWizardInput) {
  const activeDna = await getActiveDna(userId);
  if (!activeDna) {
    throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  }

  let captured: { project: UltimateCreatorProject; logoJobs: Awaited<ReturnType<typeof runMagikLogoJobs>>['jobs'] } | undefined;

  const billed = await withCoinChargePack(
    userId,
    CoinSpendCategory.ULTIMATE_CREATOR_PACK,
    'Ultimate Creator Pack (60 Sekunden)',
    async () => {
      let project = await createUltimateProject(userId, wizard, activeDna.id);
      project.status = 'generating';
      await saveUltimateProject(project);

      const logoOpts = wizardToLogoOptions(wizard);
      const logoResult = await runMagikLogoJobs(userId, logoOpts, activeDna);
      const [logoJobA] = logoResult.jobs;

      project.logoJobIds = logoResult.jobs.map((j) => j.id);
      project.logoImageUrl = logoJobA.imageUrl;
      project.previewThumbnail = logoJobA.imageUrl;

      project.assets = project.assets.map((a) => {
        if (a.key !== 'logo') return a;
        return {
          ...a,
          jobId: logoJobA.id,
          imageUrl: logoJobA.imageUrl,
          status: logoJobA.status === 'completed' ? 'completed' : logoJobA.status === 'failed' ? 'failed' : 'pending',
        };
      });

      const packKeys = ULTIMATE_PACK_V1.filter((p) => p.key !== 'logo');

      for (const pack of packKeys) {
        const prompt = promptForPackKey(activeDna, pack.key, wizard);
        const size = sizeForPackKey(pack.key);
        const hd = true;
        const job = await runGenerationJob(userId, pack.module, activeDna, prompt, { size, hd });

        project.assets = project.assets.map((a) =>
          a.key === pack.key
            ? {
                ...a,
                jobId: job.id,
                imageUrl: job.imageUrl,
                status: job.status === 'completed' ? 'completed' : job.status === 'failed' ? 'failed' : 'pending',
              }
            : a
        );
      }

      const failed = project.assets.filter((a) => a.status === 'failed').length;
      const completed = project.assets.filter((a) => a.status === 'completed').length;
      project.status = failed === project.assets.length ? 'partial' : failed > 0 ? 'partial' : 'ready';
      if (completed > 0) project.version += 1;

      project.aiHistory.push({
        id: `pack-${Date.now()}`,
        intent: 'ultimate-creator-pack',
        summary: `Ultimate Creator Pack: ${completed}/${project.assets.length} Assets`,
        createdAt: new Date().toISOString(),
      });

      await saveUltimateProject(project);
      captured = { project, logoJobs: logoResult.jobs };
      return project.assets.map((a) => ({ status: a.status === 'completed' ? 'completed' : a.status === 'failed' ? 'failed' : 'failed' }));
    }
  );

  return {
    project: captured!.project,
    logoJobs: captured!.logoJobs,
    coinsSpent: billed.coinsSpent,
    newBalance: billed.newBalance,
  };
}

export async function markProjectExported(project: UltimateCreatorProject, platform: string): Promise<UltimateCreatorProject> {
  project.exportStatus = { ...project.exportStatus, [platform]: 'done' };
  project.status = 'exported';
  await saveUltimateProject(project);
  return project;
}
