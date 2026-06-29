import {

  LayoutDashboard,

  Dna,

  PenTool,

  Image,

  Camera,

  Sparkles,

  RefreshCw,

  Layout,

  Bot,

  Users,

  Film,

  Play,

  Smile,

  ImagePlus,

  Video,

  Music,

  Mic,

  Share2,

  Calendar,

  MessageSquare,

  Cloud,

  Store,

  Coins,

  Smartphone,

  Radio,

  Layers,

  Sticker,

  type LucideIcon,

} from 'lucide-react';

import { CREATOR_MODULES, type ModuleId } from '@ucbs/shared';



export const iconMap: Record<string, LucideIcon> = {

  LayoutDashboard,

  Dna,

  PenTool,

  Image,

  Camera,

  Sparkles,

  RefreshCw,

  Layout,

  Bot,

  Users,

  Film,

  Play,

  Smile,

  ImagePlus,

  Video,

  Music,

  Mic,

  Share2,

  Calendar,

  MessageSquare,

  Cloud,

  Store,

  Coins,

  Smartphone,

  Radio,

  Layers,

  Sticker,

};



export function getModuleIcon(iconName: string): LucideIcon {

  return iconMap[iconName] ?? LayoutDashboard;

}



export const navigationGroups = [

  {

    label: 'Übersicht',

    items: CREATOR_MODULES.filter((m) => m.category === 'core'),

  },

  {

    label: 'Studios',

    items: CREATOR_MODULES.filter((m) => m.category === 'studio'),

  },

  {

    label: 'KI Tools',

    items: CREATOR_MODULES.filter((m) => m.category === 'ai'),

  },

  {

    label: 'Team & Clan',

    items: CREATOR_MODULES.filter((m) => m.category === 'team'),

  },

  {

    label: 'Social & Content',

    items: CREATOR_MODULES.filter((m) => m.category === 'social'),

  },

  {

    label: 'Commerce',

    items: CREATOR_MODULES.filter((m) => m.category === 'commerce'),

  },

  {

    label: 'Web App',

    items: CREATOR_MODULES.filter((m) => m.category === 'mobile'),

  },

];



export type { ModuleId };

