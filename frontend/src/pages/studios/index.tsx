import { StudioPage } from './StudioPage';

export function LogoStudioPage() {
  return (
    <StudioPage
      title="Logo Studio"
      description="Gaming, Streamer, Musiker, Clan und Team Logos – basierend auf deiner Creator DNA"
      module="logo"
      coinCost={15}
      styles={['2D', '3D', 'Anime', 'Esports', 'Neon', 'Horror', 'Fantasy']}
      exports={['PNG', 'SVG', 'PDF']}
    />
  );
}

export function BannerStudioPage() {
  return (
    <StudioPage
      title="Banner Studio"
      description="Profilbanner und Header-Grafiken für Twitch, YouTube und Social Media"
      module="banner"
      coinCost={10}
      styles={['Twitch', 'YouTube', 'Discord', 'TikTok']}
      styleLabel="Plattform"
      exports={['PNG', 'JPG']}
    />
  );
}

export function FacecamStudioPage() {
  return (
    <StudioPage
      title="Facecam Studio"
      description="Facecam-Rahmen, Overlays und Stream-Dekorationen"
      module="facecam"
      coinCost={10}
      styles={['Minimal', 'Gaming', 'Neon', 'Animated']}
      exports={['PNG']}
    />
  );
}
