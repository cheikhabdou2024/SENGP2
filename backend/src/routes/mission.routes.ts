import { Router } from 'express';
import { MissionController } from '../controllers/mission.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { UserType } from '../types';
import {
  createMissionValidator,
  updateStatusValidator,
} from '../validators/mission.validator';

const router = Router();

// All mission routes require authentication
router.use(AuthMiddleware.verifyToken);

// Get all missions (with filters)
router.get('/', MissionController.getAll);

// Get user's missions
router.get('/my-missions', MissionController.getMyMissions);

// Search/track by tracking number
router.get('/track/:trackingNumber', MissionController.trackByNumber);

// Get mission by ID
router.get('/:id', MissionController.getById);

// Create mission (Expediteur only)
router.post(
  '/',
  AuthMiddleware.requireRole(UserType.EXPEDITEUR),
  ValidationMiddleware.validate(createMissionValidator),
  MissionController.create
);

// Update mission
router.put('/:id', MissionController.update);

// Accept mission (GP only)
router.post(
  '/:id/accept',
  AuthMiddleware.requireRole(UserType.GP),
  MissionController.accept
);

// Update mission status
router.post(
  '/:id/status',
  ValidationMiddleware.validate(updateStatusValidator),
  MissionController.updateStatus
);

// Verify QR code delivery (must be before /:id routes)
router.post(
  '/verify-qr',
  AuthMiddleware.requireRole(UserType.GP),
  MissionController.verifyDelivery
);

// Generate QR code
router.post('/:id/qr-code', MissionController.generateQRCode);

// Get tracking history
router.get('/:id/tracking', MissionController.getTracking);

export default router;
