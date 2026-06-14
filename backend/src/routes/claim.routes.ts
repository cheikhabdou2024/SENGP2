import { Router } from 'express';
import { ClaimController } from '../controllers/claim.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { UserType } from '../types';
import {
  createClaimValidator,
  updateClaimValidator,
  resolveClaimValidator,
} from '../validators/claim.validator';

const router = Router();

// All claim routes require authentication
router.use(AuthMiddleware.verifyToken);

// Get current user's claims (must come before /:id)
router.get('/my-claims', ClaimController.getMyClaims);

// List all claims (admin only)
router.get('/', AuthMiddleware.requireRole(UserType.ADMIN), ClaimController.getAll);

// Get claim by ID (claimant or admin)
router.get('/:id', ClaimController.getById);

// Create claim
router.post(
  '/',
  ValidationMiddleware.validate(createClaimValidator),
  ClaimController.create
);

// Update claim (claimant for own descriptive fields; admin for any)
router.put(
  '/:id',
  ValidationMiddleware.validate(updateClaimValidator),
  ClaimController.update
);

// Resolve claim (admin only)
router.post(
  '/:id/resolve',
  AuthMiddleware.requireRole(UserType.ADMIN),
  ValidationMiddleware.validate(resolveClaimValidator),
  ClaimController.resolve
);

export default router;
