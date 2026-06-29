import { LogoStudioPage } from './LogoStudioPage';
import { StudioPage } from './StudioPage';
import { OverlayStudioPage } from './OverlayStudioPage';
import { StickerStudioPage } from './StickerStudioPage';
import { BANNER_PLATFORM_SPECS, type BannerPlatform } from '@ucbs/shared';

const BANNER_PLATFORMS = Object.keys(BANNER_PLATFORM_SPECS) as BannerPlatform[];

export { LogoStudioPage, OverlayStudioPage, StickerStudioPage };

export function BannerStudioPage() {
  return (
    <StudioPage
      title="Banner Studio"
      description="Profilbanner mit automatischen Plattform-Größen"
      module="banner"
      coinCost={10}
      bannerPlatforms={BANNER_PLATFORMS}
      exports={['PNG', 'HD']}
    />
  );
}

export function FacecamStudioPage() {
  return (
    <StudioPage
      title="Facecam Studio"
      description="Facecam-Rahmen und Stream-Overlays — Live-tauglich, transparenter Hintergrund"
      module="facecam"
      coinCost={10}
      facecamShapes={['rectangle', 'circle', 'hexagon']}
      styles={['Minimal', 'Gaming', 'Neon', 'Animated']}
      exports={['PNG']}
    />
  );
}
