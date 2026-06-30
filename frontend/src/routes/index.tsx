import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout, AuthLayout } from '@/components/layout';
import { ProtectedRoute, PublicOnlyRoute } from '@/components/auth/ProtectedRoute';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { CreatorDNAPage } from '@/pages/creator-dna/CreatorDNAPage';
import { LogoStudioPage, BannerStudioPage, FacecamStudioPage, OverlayStudioPage, StickerStudioPage } from '@/pages/studios';
import { BrandingGeneratorPage } from '@/pages/branding/BrandingGeneratorPage';
import { AIImagePage } from '@/pages/ai/AIImagePage';
import { LayoutStudioPage } from '@/pages/layout/LayoutStudioPage';
import { ChangeRequestPage } from '@/pages/change-request/ChangeRequestPage';
import { AIAssistantPage } from '@/pages/assistant/AIAssistantPage';
import { TeamDNAPage } from '@/pages/team/TeamDNAPage';
import { VideoStudioPage } from '@/pages/video/VideoStudioPage';
import { IntroOutroPage } from '@/pages/intro-outro/IntroOutroPage';
import { VTuberStudioPage } from '@/pages/vtuber/VTuberStudioPage';
import { AIVideoPage } from '@/pages/ai/AIVideoPage';
import { AIVoicePage } from '@/pages/ai/AIVoicePage';
import { MarketplacePage } from '@/pages/marketplace/MarketplacePage';
import { SocialMediaPage } from '@/pages/social/SocialMediaPage';
import { ContentCalendarPage } from '@/pages/calendar/ContentCalendarPage';
import { TeamChatPage } from '@/pages/chat/TeamChatPage';
import { MobileAppPage } from '@/pages/mobile/MobileAppPage';
import { FileCloudPage } from '@/pages/files/FileCloudPage';
import { ModulePage } from '@/pages/modules/ModulePage';
import { CoinsPage } from '@/pages/coins/CoinsPage';
import { MagikAssistantSettingsPage } from '@/pages/settings/MagikAssistantSettingsPage';
import { CREATOR_MODULES } from '@ucbs/shared';
import { Skeleton } from '@/v2/components/Skeleton';

const DashboardV2Page = lazy(() => import('@/v2/pages/DashboardV2Page').then((m) => ({ default: m.DashboardV2Page })));
const BrandingStudioHubPage = lazy(() => import('@/v2/pages/BrandingStudioHubPage').then((m) => ({ default: m.BrandingStudioHubPage })));
const AICreatorHubPage = lazy(() => import('@/v2/pages/AICreatorHubPage').then((m) => ({ default: m.AICreatorHubPage })));
const TeamsHubPage = lazy(() => import('@/v2/pages/TeamsHubPage').then((m) => ({ default: m.TeamsHubPage })));
const ProjectsHubPage = lazy(() => import('@/v2/pages/ProjectsHubPage').then((m) => ({ default: m.ProjectsHubPage })));
const SettingsHubPage = lazy(() => import('@/v2/pages/SettingsHubPage').then((m) => ({ default: m.SettingsHubPage })));

function PageLoader() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const IMPLEMENTED_PATHS = new Set([
  '/creator-dna',
  '/logo-studio',
  '/banner-studio',
  '/facecam-studio',
  '/overlay-studio',
  '/sticker-studio',
  '/branding-generator',
  '/ai-image',
  '/layout-studio',
  '/change-request',
  '/ai-assistant',
  '/team-dna',
  '/video-studio',
  '/intro-outro',
  '/vtuber-studio',
  '/ai-video',
  '/ai-voice',
  '/marketplace',
  '/social-media',
  '/content-calendar',
  '/team-chat',
  '/mobile-app',
  '/file-cloud',
  '/settings/magik-assistant',
]);

const IMPLEMENTED_ROUTES: Record<string, ReactNode> = {
  '/creator-dna': <CreatorDNAPage />,
  '/logo-studio': <LogoStudioPage />,
  '/banner-studio': <BannerStudioPage />,
  '/facecam-studio': <FacecamStudioPage />,
  '/overlay-studio': <OverlayStudioPage />,
  '/sticker-studio': <StickerStudioPage />,
  '/branding-generator': <BrandingGeneratorPage />,
  '/ai-image': <AIImagePage />,
  '/layout-studio': <LayoutStudioPage />,
  '/change-request': <ChangeRequestPage />,
  '/ai-assistant': <AIAssistantPage />,
  '/team-dna': <TeamDNAPage />,
  '/video-studio': <VideoStudioPage />,
  '/intro-outro': <IntroOutroPage />,
  '/vtuber-studio': <VTuberStudioPage />,
  '/ai-video': <AIVideoPage />,
  '/ai-voice': <AIVoicePage />,
  '/marketplace': <MarketplacePage />,
  '/social-media': <SocialMediaPage />,
  '/content-calendar': <ContentCalendarPage />,
  '/team-chat': <TeamChatPage />,
  '/mobile-app': <MobileAppPage />,
  '/file-cloud': <FileCloudPage />,
  '/settings/magik-assistant': <MagikAssistantSettingsPage />,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicOnlyRoute>
              <LoginPage />
            </PublicOnlyRoute>
          }
        />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Lazy><DashboardV2Page /></Lazy>} />
        <Route path="/branding-studio" element={<Lazy><BrandingStudioHubPage /></Lazy>} />
        <Route path="/ai-creator" element={<Lazy><AICreatorHubPage /></Lazy>} />
        <Route path="/teams" element={<Lazy><TeamsHubPage /></Lazy>} />
        <Route path="/projects" element={<Lazy><ProjectsHubPage /></Lazy>} />
        <Route path="/settings" element={<Lazy><SettingsHubPage /></Lazy>} />
        <Route path="/settings/magik-assistant" element={<MagikAssistantSettingsPage />} />
        <Route path="/ai-music" element={<Navigate to="/ai-creator" replace />} />
        <Route path="/coins" element={<CoinsPage />} />
        {CREATOR_MODULES.filter((m) => m.id !== 'dashboard' && m.id !== 'coins' && m.id !== 'ai-music').map((mod) => (
          <Route
            key={mod.id}
            path={mod.path}
            element={
              IMPLEMENTED_PATHS.has(mod.path)
                ? IMPLEMENTED_ROUTES[mod.path]
                : <ModulePage />
            }
          />
        ))}
      </Route>

      <Route path="/agency-dna" element={<Navigate to="/dashboard" replace />} />
      <Route path="/agency-management" element={<Navigate to="/dashboard" replace />} />
      <Route path="/client-portal" element={<Navigate to="/dashboard" replace />} />
      <Route path="/white-label" element={<Navigate to="/dashboard" replace />} />
      <Route path="/live-streaming" element={<Navigate to="/dashboard" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
