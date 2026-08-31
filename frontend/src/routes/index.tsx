import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout, AuthLayout } from '@/components/layout';
import { ProtectedRoute, PublicOnlyRoute, AdminRoute } from '@/components/auth/ProtectedRoute';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { CreatorDNAPage } from '@/pages/creator-dna/CreatorDNAPage';
import { LogoStudioPage, BannerStudioPage, FacecamStudioPage, OverlayStudioPage, StickerStudioPage } from '@/pages/studios';
import { BrandingGeneratorPage } from '@/pages/branding/BrandingGeneratorPage';
import { AIImagePage } from '@/pages/ai/AIImagePage';
import { LayoutStudioPage } from '@/pages/layout/LayoutStudioPage';
import { ChangeRequestPage } from '@/pages/change-request/ChangeRequestPage';
import { TeamDNAPage } from '@/pages/team/TeamDNAPage';
import { VideoStudioPage } from '@/pages/video/VideoStudioPage';
import { IntroOutroPage } from '@/pages/intro-outro/IntroOutroPage';
import { VTuberStudioPage } from '@/pages/vtuber/VTuberStudioPage';
import { AIVideoPage } from '@/pages/ai/AIVideoPage';
import { AIVoicePage } from '@/pages/ai/AIVoicePage';
import { MarketplacePage } from '@/pages/marketplace/MarketplacePage';
import { ContentCalendarPage } from '@/pages/calendar/ContentCalendarPage';
import { TeamChatPage } from '@/pages/chat/TeamChatPage';
import { MobileAppPage } from '@/pages/mobile/MobileAppPage';
import { FileCloudPage } from '@/pages/files/FileCloudPage';
import { ModulePage } from '@/pages/modules/ModulePage';
import { CoinsPage } from '@/pages/coins/CoinsPage';
import { PromptStudioPage } from '@/pages/prompt-studio/PromptStudioPage';
import { UltimateCreatorPage, ExportCenterPage } from '@/pages/ultimate';
import { MagikAssistantSettingsPage } from '@/pages/settings/MagikAssistantSettingsPage';
import { NexterPage } from '@/pages/nexter/NexterPage';
import { MockupStudioPage } from '@/pages/studios/MockupStudioPage';
import { StreamsetStudioPage } from '@/pages/studios/StreamsetStudioPage';
import { AnimationStudioPage } from '@/pages/studios/AnimationStudioPage';
import { ShortsStudioPage } from '@/pages/studios/ShortsStudioPage';
import { SocialStudioPage } from '@/pages/studios/SocialStudioPage';
import { TextStudioPage } from '@/pages/studios/TextStudioPage';
import { TemplatesPage } from '@/pages/templates/TemplatesPage';
import { AdminPage } from '@/pages/admin/AdminPage';
import { LegalPage } from '@/pages/legal/LegalPage';
import { OnboardingPage } from '@/pages/onboarding/OnboardingPage';
import { NexterStudioLayout } from '@/components/nexter';
import { CREATOR_MODULES } from '@ucbs/shared';
import { Skeleton } from '@/v2/components/Skeleton';

const DashboardV2Page = lazy(() => import('@/v2/pages/DashboardV2Page').then((m) => ({ default: m.DashboardV2Page })));
const ProjectsHubPage = lazy(() => import('@/v2/pages/ProjectsHubPage').then((m) => ({ default: m.ProjectsHubPage })));
const ProjectDetailPage = lazy(() => import('@/v2/pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })));
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

function withNexter(page: ReactNode, hint: string) {
  return <NexterStudioLayout hint={hint}>{page}</NexterStudioLayout>;
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
  '/prompt-studio',
  '/nexter',
  '/mockup-studio',
  '/streamset-studio',
  '/animation-studio',
  '/shorts-studio',
  '/social-studio',
  '/text-studio',
  '/templates',
  '/admin',
]);

const IMPLEMENTED_ROUTES: Record<string, ReactNode> = {
  '/creator-dna': withNexter(<CreatorDNAPage />, 'Creator DNA'),
  '/logo-studio': <LogoStudioPage />,
  '/banner-studio': <BannerStudioPage />,
  '/facecam-studio': <FacecamStudioPage />,
  '/overlay-studio': <OverlayStudioPage />,
  '/sticker-studio': <StickerStudioPage />,
  '/branding-generator': <BrandingGeneratorPage />,
  '/ai-image': <AIImagePage />,
  '/layout-studio': <LayoutStudioPage />,
  '/change-request': <ChangeRequestPage />,
  '/ai-assistant': <Navigate to="/nexter" replace />,
  '/prompt-studio': <PromptStudioPage />,
  '/nexter': <NexterPage />,
  '/mockup-studio': <MockupStudioPage />,
  '/streamset-studio': <StreamsetStudioPage />,
  '/animation-studio': <AnimationStudioPage />,
  '/shorts-studio': <ShortsStudioPage />,
  '/social-studio': <SocialStudioPage />,
  '/social-media': <SocialStudioPage />,
  '/text-studio': <TextStudioPage />,
  '/templates': <TemplatesPage />,
  '/admin': <AdminRoute><AdminPage /></AdminRoute>,
  '/team-dna': <TeamDNAPage />,
  '/video-studio': <VideoStudioPage />,
  '/intro-outro': <IntroOutroPage />,
  '/vtuber-studio': <VTuberStudioPage />,
  '/ai-video': <AIVideoPage />,
  '/ai-voice': <AIVoicePage />,
  '/marketplace': <MarketplacePage />,
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
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Lazy><DashboardV2Page /></Lazy>} />
        <Route path="/branding-studio" element={<Navigate to="/logo-studio" replace />} />
        <Route path="/ai-creator" element={<Navigate to="/nexter" replace />} />
        <Route path="/teams" element={<Navigate to="/dashboard" replace />} />
        <Route path="/projects" element={<Lazy><ProjectsHubPage /></Lazy>} />
        <Route path="/projects/:projectId" element={<Lazy><ProjectDetailPage /></Lazy>} />
        <Route path="/settings" element={<Lazy><SettingsHubPage /></Lazy>} />
        <Route path="/ultimate-creator" element={<UltimateCreatorPage />} />
        <Route path="/export-center" element={<ExportCenterPage />} />
        <Route path="/settings/magik-assistant" element={<Navigate to="/settings" replace />} />
        <Route path="/ai-music" element={<Navigate to="/nexter" replace />} />
        <Route path="/marketplace" element={<Navigate to="/dashboard" replace />} />
        <Route path="/social-media" element={<Navigate to="/social-studio" replace />} />
        <Route path="/team-chat" element={<Navigate to="/dashboard" replace />} />
        <Route path="/team-dna" element={<Navigate to="/dashboard" replace />} />
        <Route path="/vtuber-studio" element={<Navigate to="/animation-studio" replace />} />
        <Route path="/mobile-app" element={<Navigate to="/settings" replace />} />
        <Route path="/content-calendar" element={<ContentCalendarPage />} />
        <Route path="/coins" element={<CoinsPage />} />
        <Route path="/nexter" element={<NexterPage />} />
        <Route path="/ai-assistant" element={<Navigate to="/nexter" replace />} />
        <Route path="/mockup-studio" element={<MockupStudioPage />} />
        <Route path="/streamset-studio" element={<StreamsetStudioPage />} />
        <Route path="/animation-studio" element={<AnimationStudioPage />} />
        <Route path="/shorts-studio" element={<ShortsStudioPage />} />
        <Route path="/social-studio" element={<SocialStudioPage />} />
        <Route path="/text-studio" element={<TextStudioPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
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

      <Route path="/legal/:slug" element={<LegalPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
