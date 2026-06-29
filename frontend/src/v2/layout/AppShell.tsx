import { Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { SidebarNav } from './SidebarNav';
import { TopBar } from './TopBar';
import { PageTransition } from '@/v2/components/PageTransition';
import { useUiStore } from '@/v2/store/ui-store';
import { PwaInstallBanner } from '@/components/pwa/PwaInstallBanner';

export function AppShell() {
  const location = useLocation();
  const { mobileNavOpen, setMobileNavOpen } = useUiStore();

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--ucbs-bg)]">
      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          aria-label="Navigation schließen"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <SidebarNav />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <PwaInstallBanner />
          <AnimatePresence mode="wait">
            <PageTransition key={location.pathname}>
              <Outlet />
            </PageTransition>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
