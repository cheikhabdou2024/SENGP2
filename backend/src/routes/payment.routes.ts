import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { UserType } from '../types';
import { createPaymentValidator } from '../validators/payment.validator';

const router = Router();

// Provider webhooks/callbacks — PUBLIC (no auth). Must be registered before the
// verifyToken middleware. Authenticity is enforced by signature/token in the
// provider layer.
router.post('/webhook/wave', PaymentController.webhookWave);
router.post('/webhook/orange', PaymentController.webhookOrange);

// Everything below requires authentication
router.use(AuthMiddleware.verifyToken);

// Current user's payments
router.get('/my-payments', PaymentController.getMyPayments);

// Get payment by ID
router.get('/:id', PaymentController.getById);

// Initiate a payment (expéditeur only)
router.post(
  '/',
  AuthMiddleware.requireRole(UserType.EXPEDITEUR),
  ValidationMiddleware.validate(createPaymentValidator),
  PaymentController.create
);

export default router;
