import { Router } from 'express';
import multer from 'multer';
import { TripController } from '../controllers/trip.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { UserType } from '../types';
import {
  createTripValidator,
  updateTripStatusValidator,
} from '../validators/trip.validator';

const router = Router();

// Parse the multipart/form-data body sent by the create-trip page (flight ticket
// photo + text fields). Kept in memory; the photo is not persisted yet.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// All trip routes require authentication
router.use(AuthMiddleware.verifyToken);

// Search available trips (must come before /:id)
router.get('/search', TripController.search);

// Get current GP's trips
router.get('/my-trips', TripController.getMyTrips);

// Get all trips (with filters)
router.get('/', TripController.getAll);

// Get trip by ID
router.get('/:id', TripController.getById);

// Create trip (GP only)
router.post(
  '/',
  AuthMiddleware.requireRole(UserType.GP),
  upload.single('flight_ticket_photo'),
  ValidationMiddleware.validate(createTripValidator),
  TripController.create
);

// Update trip (owner GP only)
router.put(
  '/:id',
  AuthMiddleware.requireRole(UserType.GP),
  TripController.update
);

// Update trip status (owner GP only)
router.post(
  '/:id/status',
  AuthMiddleware.requireRole(UserType.GP),
  ValidationMiddleware.validate(updateTripStatusValidator),
  TripController.update
);

// Cancel trip (owner GP only)
router.delete(
  '/:id',
  AuthMiddleware.requireRole(UserType.GP),
  TripController.cancel
);

export default router;
