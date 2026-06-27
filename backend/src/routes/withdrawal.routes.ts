import { Router } from 'express';
import { WithdrawalController } from '../controllers/withdrawal.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { UserType } from '../types';
import {
  createWithdrawalValidator,
  rejectWithdrawalValidator,
} from '../validators/withdrawal.validator';

const router = Router();

router.use(AuthMiddleware.verifyToken);

// Current GP's withdrawals
router.get('/my-withdrawals', WithdrawalController.getMine);

// Request a withdrawal (GP only)
router.post(
  '/',
  AuthMiddleware.requireRole(UserType.GP),
  ValidationMiddleware.validate(createWithdrawalValidator),
  WithdrawalController.request
);

// List all withdrawals (admin only)
router.get('/', AuthMiddleware.requireRole(UserType.ADMIN), WithdrawalController.listAll);

// Approve / reject (admin only)
router.put(
  '/:id/approve',
  AuthMiddleware.requireRole(UserType.ADMIN),
  WithdrawalController.approve
);
router.put(
  '/:id/reject',
  AuthMiddleware.requireRole(UserType.ADMIN),
  ValidationMiddleware.validate(rejectWithdrawalValidator),
  WithdrawalController.reject
);

export default router;
