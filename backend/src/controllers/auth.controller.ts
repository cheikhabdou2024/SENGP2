import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

export class AuthController {
  /**
   * Register new user
   * POST /api/v1/auth/register
   */
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { user, token } = await AuthService.register(req.body);

      ResponseUtil.created(res, { user, token }, 'User registered successfully');
    } catch (error: any) {
      logger.error('Registration error:', error);

      if (error.message.includes('already registered')) {
        ResponseUtil.conflict(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Registration failed');
    }
  }

  /**
   * Google sign-in / sign-up
   * POST /api/v1/auth/google
   */
  static async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const { id_token, user_type, expected_type } = req.body;
      const { user, token, isNew } = await AuthService.googleAuth(id_token, user_type, expected_type);

      ResponseUtil.success(
        res,
        { user, token, isNew },
        isNew ? 'Account created' : 'Login successful'
      );
    } catch (error: any) {
      logger.error('Google auth error:', error);

      if (error.message.includes('Invalid Google')) {
        ResponseUtil.unauthorized(res, error.message);
        return;
      }
      if (error.message === 'Account type mismatch') {
        ResponseUtil.forbidden(res, 'This account belongs to a different profile type');
        return;
      }
      if (error.message.includes('not configured')) {
        ResponseUtil.serverError(res, error.message);
        return;
      }
      if (error.message.includes('suspended')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Google authentication failed');
    }
  }

  /**
   * Login user
   * POST /api/v1/auth/login
   */
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, password, expected_type } = req.body;
      const { user, token } = await AuthService.login({
        email,
        password,
        expectedType: expected_type,
      });

      ResponseUtil.success(res, { user, token }, 'Login successful');
    } catch (error: any) {
      logger.error('Login error:', error);

      if (error.message === 'Invalid credentials') {
        ResponseUtil.unauthorized(res, 'Invalid email or password');
        return;
      }

      if (error.message === 'Account type mismatch') {
        ResponseUtil.forbidden(res, 'This account belongs to a different profile type');
        return;
      }

      if (error.message.includes('suspended')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Login failed');
    }
  }

  /**
   * Verify email
   * POST /api/v1/auth/verify-email
   */
  static async verifyEmail(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      await AuthService.verifyEmail(req.user.id);

      ResponseUtil.success(res, undefined, 'Email verified successfully');
    } catch (error: any) {
      logger.error('Email verification error:', error);
      ResponseUtil.badRequest(res, error.message || 'Verification failed');
    }
  }

  /**
   * Verify phone
   * POST /api/v1/auth/verify-phone
   */
  static async verifyPhone(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      await AuthService.verifyPhone(req.user.id);

      ResponseUtil.success(res, undefined, 'Phone verified successfully');
    } catch (error: any) {
      logger.error('Phone verification error:', error);
      ResponseUtil.badRequest(res, error.message || 'Verification failed');
    }
  }

  /**
   * Change password
   * POST /api/v1/auth/change-password
   */
  static async changePassword(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const { oldPassword, newPassword } = req.body;

      await AuthService.changePassword(req.user.id, oldPassword, newPassword);

      ResponseUtil.success(res, undefined, 'Password changed successfully');
    } catch (error: any) {
      logger.error('Password change error:', error);

      if (error.message === 'Invalid current password') {
        ResponseUtil.badRequest(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Password change failed');
    }
  }

  /**
   * Request password reset
   * POST /api/v1/auth/forgot-password
   */
  static async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const { email } = req.body;

      await AuthService.requestPasswordReset(email);

      ResponseUtil.success(
        res,
        undefined,
        'If the email exists, a reset link will be sent'
      );
    } catch (error: any) {
      logger.error('Password reset request error:', error);
      ResponseUtil.badRequest(res, error.message || 'Request failed');
    }
  }
}
