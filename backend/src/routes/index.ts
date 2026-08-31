import { Router } from 'express';
import { authRoutes, brandingRoutes } from './auth.routes.js';
import {
  logoRoutes,
  bannerRoutes,
  facecamRoutes,
  overlayRoutes,
  stickerRoutes,
} from './studio.routes.js';
import { dnaRoutes } from './dna.routes.js';
import { aiRoutes } from './ai.routes.js';
import { aiVideoRoutes, aiMusicRoutes, aiVoiceRoutes } from './ai-media.routes.js';
import { stripeRoutes } from './stripe.routes.js';
import { paypalRoutes } from './paypal.routes.js';
import { layoutRoutes } from './layout.routes.js';
import { changeRequestRoutes } from './change-request.routes.js';
import { assistantRoutes } from './assistant.routes.js';
import { teamRoutes } from './team.routes.js';
import { agencyRoutes } from './agency.routes.js';
import { videoRoutes } from './video.routes.js';
import { introOutroRoutes } from './intro-outro.routes.js';
import { vtuberRoutes } from './vtuber.routes.js';
import { marketplaceRoutes } from './marketplace.routes.js';
import { socialRoutes } from './social.routes.js';
import { calendarRoutes } from './calendar.routes.js';
import { chatRoutes } from './chat.routes.js';
import { clientPortalRoutes } from './client-portal.routes.js';
import { agencyManagementRoutes } from './agency-management.routes.js';
import { whiteLabelRoutes } from './white-label.routes.js';
import { mobileRoutes } from './mobile.routes.js';
import { liveStreamRoutes } from './live-stream.routes.js';
import {
  filesRoutes,
  coinsRoutes,
} from './modules.routes.js';
import { statusRoutes } from './status.routes.js';
import { configRoutes } from './config.routes.js';
import { magikRoutes } from './magik.routes.js';
import { magikAiRoutes } from './magik-ai.routes.js';
import { ccdRoutes } from './ccd.routes.js';
import { ultimateCreatorRoutes } from './ultimate-creator.routes.js';
import { promptStudioRoutes } from './prompt-studio.routes.js';
import { projectRoutes } from './project.routes.js';
import { adminRoutes } from './admin.routes.js';
import { pricingRoutes, balanceRoutes } from './pricing.routes.js';
import { nexterRoutes } from './nexter.routes.js';
import { mockupRoutes } from './mockup.routes.js';
import { animationRoutes } from './animation.routes.js';
import { streamsetRoutes } from './streamset.routes.js';
import { textRoutes } from './text.routes.js';
import { socialStudioRoutes } from './social-studio.routes.js';
import { feedbackRoutes } from './feedback.routes.js';
import { legalRoutes } from './legal.routes.js';
import { authenticate } from '../middleware/auth.js';
import { blockLegacyV1 } from '../middleware/v1-legacy.js';

function v1Blocked(inner: Router): Router {
  const wrap = Router();
  wrap.use(authenticate, blockLegacyV1);
  wrap.use(inner);
  return wrap;
}

export const apiRouter = Router();

apiRouter.use('/status', statusRoutes);
apiRouter.use('/magik', magikRoutes);
apiRouter.use('/magik-ai', magikAiRoutes);
apiRouter.use('/ccd', ccdRoutes);
apiRouter.use('/ultimate-creator', ultimateCreatorRoutes);
apiRouter.use('/config', configRoutes);
apiRouter.use('/prompts', promptStudioRoutes);
apiRouter.use('/projects', projectRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/pricing', pricingRoutes);
apiRouter.use('/balance', balanceRoutes);
apiRouter.use('/nexter', nexterRoutes);
apiRouter.use('/mockups', mockupRoutes);
apiRouter.use('/animations', animationRoutes);
apiRouter.use('/streamset', streamsetRoutes);
apiRouter.use('/text', textRoutes);
apiRouter.use('/social-studio', socialStudioRoutes);
apiRouter.use('/feedback', feedbackRoutes);
apiRouter.use('/legal', legalRoutes);

apiRouter.use('/auth', authRoutes);
apiRouter.use('/dna', dnaRoutes);
apiRouter.use('/logo', logoRoutes);
apiRouter.use('/banner', bannerRoutes);
apiRouter.use('/facecam', facecamRoutes);
apiRouter.use('/overlay', overlayRoutes);
apiRouter.use('/sticker', stickerRoutes);
apiRouter.use('/branding', brandingRoutes);
apiRouter.use('/change-request', changeRequestRoutes);
apiRouter.use('/layout', layoutRoutes);
apiRouter.use('/assistant', assistantRoutes);
apiRouter.use('/team', v1Blocked(teamRoutes));
apiRouter.use('/agency', v1Blocked(agencyRoutes));
apiRouter.use('/video', videoRoutes);
apiRouter.use('/intro-outro', introOutroRoutes);
apiRouter.use('/vtuber', vtuberRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/ai/video', aiVideoRoutes);
apiRouter.use('/ai/music', aiMusicRoutes);
apiRouter.use('/ai/voice', aiVoiceRoutes);
apiRouter.use('/social', socialRoutes);
apiRouter.use('/calendar', calendarRoutes);
apiRouter.use('/chat', v1Blocked(chatRoutes));
apiRouter.use('/client', v1Blocked(clientPortalRoutes));
apiRouter.use('/agency-management', v1Blocked(agencyManagementRoutes));
apiRouter.use('/files', filesRoutes);
apiRouter.use('/marketplace', v1Blocked(marketplaceRoutes));
apiRouter.use('/coins', coinsRoutes);
apiRouter.use('/stripe', stripeRoutes);
apiRouter.use('/paypal', paypalRoutes);
apiRouter.use('/white-label', v1Blocked(whiteLabelRoutes));
apiRouter.use('/mobile', v1Blocked(mobileRoutes));
apiRouter.use('/live-stream', v1Blocked(liveStreamRoutes));
