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

// Record live GPS position (assigned GP only)
router.post(
  '/:id/location',
  AuthMiddleware.requireRole(UserType.GP),
  MissionController.addLocation
);

// Proof-of-delivery QR (expediteur owner / assigned GP / admin)
router.post('/:id/delivery-qr', MissionController.deliveryQR);

// Set recipient identity (expediteur owner)
router.post('/:id/recipient', MissionController.setRecipient);

// Update mission status
router.post(
  '/:id/status',
  ValidationMiddleware.validate(updateStatusValidator),
  MissionController.updateStatus
);

// Generate QR code
router.post('/:id/qr-code', MissionController.generateQRCode);

// Get tracking history
router.get('/:id/tracking', MissionController.getTracking);

export default router;
