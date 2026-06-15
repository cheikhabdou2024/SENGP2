import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { RateLimitMiddleware } from '../middlewares/rateLimit.middleware';
import {
  registerValidator,
  loginValidator,
  googleAuthValidator,
  changePasswordValidator,
  forgotPasswordValidator,
} from '../validators/auth.validator';

const router = Router();

// Public routes
router.post(
  '/register',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate(registerValidator),
  AuthController.register
);

router.post(
  '/login',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate(loginValidator),
  AuthController.login
);

router.post(
  '/google',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate(googleAuthValidator),
  AuthController.googleAuth
);

router.post(
  '/forgot-password',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate(forgotPasswordValidator),
  AuthController.forgotPassword
);

// Protected routes
router.post(
  '/verify-email',
  AuthMiddleware.verifyToken,
  AuthController.verifyEmail
);

router.post(
  '/verify-phone',
  AuthMiddleware.verifyToken,
  AuthController.verifyPhone
);

router.post(
  '/change-password',
  AuthMiddleware.verifyToken,
  ValidationMiddleware.validate(changePasswordValidator),
  AuthController.changePassword
);

export default router;
