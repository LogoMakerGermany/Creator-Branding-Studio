import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';

const mainNav = [
  { to: '/', label: 'Dashboard', icon: '◈' },
  { to: '/onboarding', label: 'Neues Projekt', icon: '✦' },
];

const projectNav = (id: string) => [
  { to: `/projects/${id}/generators`, label: 'Generatoren', icon: '⚡' },
  { to: `/projects/${id}/dna`, label: 'DNA Profil', icon: '🧬' },
  { to: `/projects/${id}/stream-set`, label: 'Stream-Set', icon: '📦' },
  { to: `/projects/${id}/generate/banner`, label: 'Banner', icon: '🖼' },
  { to: `/projects/${id}/generate/overlay`, label: 'Overlay', icon: '▣' },
  { to: `/projects/${id}/generate/facecam`, label: 'Facecam', icon: '🎥' },
  { to: `/projects/${id}/intro-outro`, label: 'Intro/Outro', icon: '🎬' },
  { to: `/projects/${id}/stickers`, label: 'Sticker Studio', icon: '🏷' },
  { to: `/projects/${id}/test-mode`, label: 'Testmodus', icon: '🧪' },
  { to: `/projects/${id}/preview`, label: 'Vorschau', icon: '👁' },
  { to: `/projects/${id}/merch`, label: 'Merch Studio', icon: '👕' },
  { to: `/projects/${id}/downloads`, label: 'Downloads', icon: '⬇' },
];

const generatorNav = (id: string) => [
  'logo', 'banner', 'facecam', 'overlay', 'panel', 'wallpaper', 'thumbnail',
  'alert', 'offline', 'starting_soon', 'brb', 'ending', 'social',
].map(type => ({ to: `/projects/${id}/generate/${type}`, label: type.replace(/_/g, ' '), icon: '⚡' }));

interface SidebarProps {
  projectId?: string;
}

export function Sidebar({ projectId }: SidebarProps) {
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

  return (
    <aside className="hidden lg:flex w-64 flex-col border-r border-white/5 bg-surface-2/50 p-4">
      <div className="mb-8 px-2">
        <h1 className="font-display text-lg font-bold text-gradient">Creator Branding Studio</h1>
        <p className="mt-1 text-xs text-white/40">Premium Brand DNA</p>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {mainNav.map(item => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${isActive ? 'bg-neon-pink/15 text-neon-pink' : 'text-white/60 hover:bg-white/5 hover:text-white'}`
            }>
            <span>{item.icon}</span>{item.label}
          </NavLink>
        ))}

        {projectId && (
          <>
            <p className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-white/30">Projekt</p>
            {projectNav(projectId).map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${isActive ? 'bg-neon-cyan/15 text-neon-cyan' : 'text-white/60 hover:bg-white/5 hover:text-white'}`
                }>
                <span>{item.icon}</span>{item.label}
              </NavLink>
            ))}
            <p className="mt-4 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-white/30">Generatoren</p>
            {generatorNav(projectId).map(item => (
              <NavLink key={item.to} to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-1.5 text-xs capitalize transition-colors ${isActive ? 'bg-neon-purple/15 text-neon-purple' : 'text-white/50 hover:bg-white/5 hover:text-white'}`
                }>
                <span>{item.icon}</span>{item.label}
              </NavLink>
            ))}
          </>
        )}

        {isAdmin && (
          <>
            <p className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-white/30">Admin</p>
            <NavLink to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2 text-sm ${isActive ? 'bg-red-500/15 text-red-400' : 'text-white/60 hover:bg-white/5'}`
              }>
              <span>🛡</span> Admin Panel
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}

export function BottomNav({ projectId }: SidebarProps) {
  const items = projectId
    ? [
        { to: '/', label: 'Home', icon: '◈' },
        { to: `/projects/${projectId}/dna`, label: 'DNA', icon: '🧬' },
        { to: `/projects/${projectId}/stream-pack`, label: 'Pack', icon: '📦' },
        { to: `/projects/${projectId}/stickers`, label: 'Sticker', icon: '🏷' },
        { to: `/projects/${projectId}/animations`, label: 'Anim', icon: '🎬' },
      ]
    : mainNav.map(n => ({ ...n, icon: n.icon }));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-white/5 bg-surface-2/90 backdrop-blur-lg lg:hidden">
      {items.map(item => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center py-2 text-[10px] ${isActive ? 'text-neon-pink' : 'text-white/50'}`
          }>
          <span className="text-lg">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function GenerationLoader({ status }: { status: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ repeat: Infinity, duration: 2 }}
      className="flex flex-col items-center gap-4 py-12"
    >
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-neon-pink border-t-transparent" />
        <div className="absolute inset-2 animate-spin rounded-full border-2 border-neon-cyan border-b-transparent" style={{ animationDirection: 'reverse' }} />
      </div>
      <p className="text-sm text-white/60">
        {status === 'processing' ? 'KI generiert dein Asset…' : status === 'queued' ? 'In Warteschlange…' : status}
      </p>
    </motion.div>
  );
}
