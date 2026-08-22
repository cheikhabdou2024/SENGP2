import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, TokenPayload, UserType } from '../types';
import { ResponseUtil } from '../utils/response';
import { hasPermission } from '../utils/permissions';
import logger from '../utils/logger';

export class AuthMiddleware {
  /**
   * Verify JWT token and attach user to request
   */
  static verifyToken(req: AuthRequest, res: Response, next: NextFunction): void {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        ResponseUtil.unauthorized(res, 'No token provided');
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer '
      const secret = process.env.JWT_SECRET;

      if (!secret) {
        logger.error('JWT_SECRET is not defined');
        ResponseUtil.serverError(res, 'Server configuration error');
        return;
      }

      const decoded = jwt.verify(token, secret) as TokenPayload;

      // Attach user info to request
      req.user = {
        id: decoded.sub,
        email: decoded.email,
        user_type: decoded.role,
        permissions: decoded.perms,
      };

      next();
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        ResponseUtil.unauthorized(res, 'Token expired');
        return;
      }
      if (error.name === 'JsonWebTokenError') {
        ResponseUtil.unauthorized(res, 'Invalid token');
        return;
      }
      logger.error('Token verification error:', error);
      ResponseUtil.unauthorized(res, 'Authentication failed');
    }
  }

  /**
   * Check if user has required role(s)
   */
  static requireRole(...allowedRoles: UserType[]) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        ResponseUtil.unauthorized(res, 'Authentication required');
        return;
      }

      if (!allowedRoles.includes(req.user.user_type)) {
        ResponseUtil.forbidden(res, 'Insufficient permissions');
        return;
      }

      next();
    };
  }

  /**
   * Optional authentication - doesn't fail if no token
   */
  static optionalAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }

      const token = authHeader.substring(7);
      const secret = process.env.JWT_SECRET;

      if (!secret) {
        next();
        return;
      }

      const decoded = jwt.verify(token, secret) as TokenPayload;

      req.user = {
        id: decoded.sub,
        email: decoded.email,
        user_type: decoded.role,
        permissions: decoded.perms,
      };

      next();
    } catch (error) {
      // If token is invalid, continue without user
      next();
    }
  }

  /**
   * Require a specific admin permission (e.g. 'missions:assign').
   *
   * Reads the permission list embedded in the JWT. As a transition safeguard,
   * an admin whose token predates RBAC (no `perms` claim) is allowed through —
   * their next login issues a scoped token. Non-admins are always rejected.
   */
  static requirePermission(required: string) {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        ResponseUtil.unauthorized(res, 'Authentication required');
        return;
      }

      // Legacy token issued before RBAC: fall back to admin-gate only.
      if (req.user.permissions === undefined) {
        if (req.user.user_type === UserType.ADMIN) {
          next();
          return;
        }
        ResponseUtil.forbidden(res, 'Insufficient permissions');
        return;
      }

      if (!hasPermission(req.user.permissions, required)) {
        ResponseUtil.forbidden(res, `Missing permission: ${required}`);
        return;
      }

      next();
    };
  }
}
