import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout, AuthLayout } from '@/components/layout';
import { ProtectedRoute, PublicOnlyRoute, AdminRoute } from '@/components/auth/ProtectedRoute';
import { LandingPage } from '@/pages/landing/LandingPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OAuthCompletePage } from '@/pages/auth/OAuthCompletePage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { CreatorDNAPage } from '@/pages/creator-dna/CreatorDNAPage';
import { LogoStudioPage, BannerStudioPage, FacecamStudioPage, OverlayStudioPage, StickerStudioPage } from '@/pages/studios';
import { LayoutStudioPage } from '@/pages/layout/LayoutStudioPage';
import { ChangeRequestPage } from '@/pages/change-request/ChangeRequestPage';
import { VideoStudioPage } from '@/pages/video/VideoStudioPage';
import { IntroOutroPage } from '@/pages/intro-outro/IntroOutroPage';
import { AIVideoPage } from '@/pages/ai/AIVideoPage';
import { AIVoicePage } from '@/pages/ai/AIVoicePage';
import { AIMusicPage } from '@/pages/ai/AIMusicPage';
import { ContentCalendarPage } from '@/pages/calendar/ContentCalendarPage';
import { FileCloudPage } from '@/pages/files/FileCloudPage';
import { CoinsPage } from '@/pages/coins/CoinsPage';
import { PromptStudioPage } from '@/pages/prompt-studio/PromptStudioPage';
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
import { NexterSetupPage } from '@/pages/onboarding/NexterSetupPage';
import { NotFoundPage } from '@/pages/system/NotFoundPage';
import { LegacyUnavailablePage } from '@/pages/system/LegacyUnavailablePage';
import { NexterStudioLayout } from '@/components/nexter';
import { Skeleton } from '@/v2/components/Skeleton';
import { LEGACY_REDIRECTS, LEGACY_UNAVAILABLE_PATHS } from '@/routes/legacy-surfaces';

const DashboardV2Page = lazy(() => import('@/v2/pages/DashboardV2Page').then((m) => ({ default: m.DashboardV2Page })));
const ProjectsHubPage = lazy(() => import('@/v2/pages/ProjectsHubPage').then((m) => ({ default: m.ProjectsHubPage })));
const ProjectDetailPage = lazy(() => import('@/v2/pages/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })));
const SettingsHubPage = lazy(() => import('@/v2/pages/SettingsHubPage').then((m) => ({ default: m.SettingsHubPage })));
const SupportPage = lazy(() => import('@/pages/support/SupportPage').then((m) => ({ default: m.SupportPage })));

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

const PROTECTED_UNAVAILABLE = new Set([
  '/marketplace',
  '/team-chat',
  '/team-dna',
  '/teams',
]);

const PUBLIC_UNAVAILABLE = LEGACY_UNAVAILABLE_PATHS.filter((path) => !PROTECTED_UNAVAILABLE.has(path));

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
        <Route path="/login/oauth/complete" element={<OAuthCompletePage />} />
      </Route>

      <Route
        path="/verify-email"
        element={
          <ProtectedRoute>
            <VerifyEmailPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/nexter-setup"
        element={
          <ProtectedRoute>
            <NexterSetupPage />
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
        <Route path="/projects" element={<Lazy><ProjectsHubPage /></Lazy>} />
        <Route path="/projects/:projectId" element={<Lazy><ProjectDetailPage /></Lazy>} />
        <Route path="/settings" element={<Lazy><SettingsHubPage /></Lazy>} />
        <Route path="/support" element={<Lazy><SupportPage /></Lazy>} />
        <Route path="/coins" element={<CoinsPage />} />
        <Route path="/nexter" element={<NexterPage />} />
        <Route path="/creator-dna" element={withNexter(<CreatorDNAPage />, 'Creator DNA')} />
        <Route path="/logo-studio" element={<LogoStudioPage />} />
        <Route path="/banner-studio" element={<BannerStudioPage />} />
        <Route path="/facecam-studio" element={<FacecamStudioPage />} />
        <Route path="/overlay-studio" element={<OverlayStudioPage />} />
        <Route path="/sticker-studio" element={<StickerStudioPage />} />
        <Route path="/layout-studio" element={<LayoutStudioPage />} />
        <Route path="/change-request" element={<ChangeRequestPage />} />
        <Route path="/prompt-studio" element={<PromptStudioPage />} />
        <Route path="/video-studio" element={<VideoStudioPage />} />
        <Route path="/intro-outro" element={<IntroOutroPage />} />
        <Route path="/ai-video" element={<AIVideoPage />} />
        <Route path="/ai-voice" element={<AIVoicePage />} />
        <Route path="/ai-music" element={<AIMusicPage />} />
        <Route path="/content-calendar" element={<ContentCalendarPage />} />
        <Route path="/file-cloud" element={<FileCloudPage />} />
        <Route path="/mockup-studio" element={<MockupStudioPage />} />
        <Route path="/streamset-studio" element={<StreamsetStudioPage />} />
        <Route path="/animation-studio" element={<AnimationStudioPage />} />
        <Route path="/shorts-studio" element={<ShortsStudioPage />} />
        <Route path="/social-studio" element={<SocialStudioPage />} />
        <Route path="/text-studio" element={<TextStudioPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />

        {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
          <Route key={from} path={from} element={<Navigate to={to} replace />} />
        ))}
        {[...PROTECTED_UNAVAILABLE].map((path) => (
          <Route key={path} path={path} element={<LegacyUnavailablePage />} />
        ))}
      </Route>

      {PUBLIC_UNAVAILABLE.map((path) => (
        <Route key={path} path={path} element={<LegacyUnavailablePage />} />
      ))}

      <Route path="/legal/:slug" element={<LegalPage />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
