import { Router } from 'express';
import { PublicController } from '../controllers/public.controller';

// Public, unauthenticated tracking API for recipients.
const router = Router();

router.get('/track/:token', PublicController.track);
router.get('/delivery/:token', PublicController.deliveryInfo);
router.post('/delivery/:token/confirm', PublicController.confirmDelivery);

export default router;
