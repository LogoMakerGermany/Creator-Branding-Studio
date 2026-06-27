import { CREATOR_MODULES, ModuleId } from '@ucbs/shared';
import { DnaHelix } from './DnaHelix';
import { ModuleHubCard } from './ModuleHubCard';

/** Core infographic modules surrounding the DNA engine. */
const HUB_CORE_IDS = [
  ModuleId.CREATOR_DNA,
  ModuleId.LOGO_STUDIO,
  ModuleId.CHANGE_REQUEST,
  ModuleId.BRANDING_GENERATOR,
  ModuleId.LAYOUT_STUDIO,
  ModuleId.AI_ASSISTANT,
  ModuleId.TEAM_DNA,
  ModuleId.VIDEO_STUDIO,
  ModuleId.VTUBER_STUDIO,
  ModuleId.MARKETPLACE,
  ModuleId.COINS,
];

const hubModules = HUB_CORE_IDS.map((id) => CREATOR_MODULES.find((m) => m.id === id)!).filter(Boolean);

const studioExtras = CREATOR_MODULES.filter(
  (m) =>
    [ModuleId.BANNER_STUDIO, ModuleId.FACECAM_STUDIO, ModuleId.INTRO_OUTRO, ModuleId.FILE_CLOUD].includes(m.id)
);

const aiExtras = CREATOR_MODULES.filter(
  (m) =>
    [ModuleId.AI_IMAGE, ModuleId.AI_VIDEO, ModuleId.AI_MUSIC, ModuleId.AI_VOICE].includes(m.id)
);

const socialExtras = CREATOR_MODULES.filter(
  (m) =>
    [ModuleId.SOCIAL_MEDIA, ModuleId.CONTENT_CALENDAR, ModuleId.TEAM_CHAT].includes(m.id)
);

const platformExtras = CREATOR_MODULES.filter((m) => m.id === ModuleId.MOBILE_APP);

export function DnaHubGrid() {
  return (
    <div className="space-y-10">
      <div className="relative">
        {/* Connector lines (decorative) */}
        <svg
          className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
          aria-hidden
        >
          <line x1="50%" y1="50%" x2="15%" y2="20%" stroke="rgba(34,211,238,0.2)" className="ucbs-hub-line" />
          <line x1="50%" y1="50%" x2="85%" y2="20%" stroke="rgba(168,85,247,0.2)" className="ucbs-hub-line" />
          <line x1="50%" y1="50%" x2="15%" y2="80%" stroke="rgba(232,121,249,0.2)" className="ucbs-hub-line" />
          <line x1="50%" y1="50%" x2="85%" y2="80%" stroke="rgba(34,211,238,0.2)" className="ucbs-hub-line" />
        </svg>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {hubModules.slice(0, 5).map((m, i) => (
              <ModuleHubCard key={m.id} module={m} accent={i % 2 === 0 ? 'cyan' : 'purple'} compact />
            ))}
          </div>

          <div className="ucbs-neon-card mx-auto flex flex-col items-center justify-center p-6 text-center lg:min-w-[220px]">
            <DnaHelix className="h-32 w-20" />
            <h2 className="mt-4 font-display text-lg font-bold uppercase tracking-wide text-zinc-100 ucbs-title-glow">
              Creator DNA
              <br />
              Engine
            </h2>
            <p className="mt-2 text-xs text-zinc-500">
              Herzstück — analysiert Farben, Stil & Zielgruppe
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {hubModules.slice(5).map((m, i) => (
              <ModuleHubCard key={m.id} module={m} accent={i % 2 === 0 ? 'magenta' : 'cyan'} compact />
            ))}
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-brand-300">
          Studios & Assets
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {studioExtras.map((m) => (
            <ModuleHubCard key={m.id} module={m} accent="purple" compact />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-cyan-300">
          KI Media
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {aiExtras.map((m) => (
            <ModuleHubCard key={m.id} module={m} accent="cyan" compact />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-fuchsia-300">
          Social & Content
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {socialExtras.map((m) => (
            <ModuleHubCard key={m.id} module={m} accent="magenta" compact />
          ))}
        </div>
      </div>

      {platformExtras.length > 0 && (
        <div>
          <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-brand-300">
            Web App
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {platformExtras.map((m) => (
              <ModuleHubCard key={m.id} module={m} accent="purple" compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
