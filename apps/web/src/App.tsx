import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout, AuthLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { DnaPage } from './pages/DnaPage';
import { GeneratorPage } from './pages/GeneratorPage';
import { StickerStudioPage } from './pages/StickerStudioPage';
import { AnimationStudioPage } from './pages/AnimationStudioPage';
import { PreviewPage } from './pages/PreviewPage';
import { MerchPage } from './pages/MerchPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { AdminPage } from './pages/AdminPage';
import { GeneratorsPage } from './pages/GeneratorsPage';
import { LoginPage } from './pages/LoginPage';
import { CoinsPage } from './pages/CoinsPage';
import { StreamSetPage } from './pages/StreamSetPage';
import { IntroOutroPage } from './pages/IntroOutroPage';
import { TestModePage } from './pages/TestModePage';
import { useAuthStore } from './store/authStore';

const qc = new QueryClient();

function AdminRoute() {
  const user = useAuthStore(s => s.user);
  if (user?.role !== 'admin' && user?.role !== 'moderator') return <Navigate to="/" replace />;
  return <AdminPage />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/projects/:id/generators" element={<GeneratorsPage />} />
            <Route path="/projects/:id/dna" element={<DnaPage />} />
            <Route path="/projects/:id/generate/:type" element={<GeneratorPage />} />
            <Route path="/coins" element={<CoinsPage />} />
            <Route path="/projects/:id/stream-set" element={<StreamSetPage />} />
            <Route path="/projects/:id/intro-outro" element={<IntroOutroPage />} />
            <Route path="/projects/:id/test-mode" element={<TestModePage />} />
            <Route path="/projects/:id/stream-pack" element={<StreamSetPage />} />
            <Route path="/projects/:id/stickers" element={<StickerStudioPage />} />
            <Route path="/projects/:id/animations" element={<AnimationStudioPage />} />
            <Route path="/projects/:id/preview" element={<PreviewPage />} />
            <Route path="/projects/:id/merch" element={<MerchPage />} />
            <Route path="/projects/:id/downloads" element={<DownloadsPage />} />
            <Route path="/admin" element={<AdminRoute />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
