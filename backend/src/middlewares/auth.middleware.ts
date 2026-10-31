import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, TokenPayload, UserType } from '../types';
import { ResponseUtil } from '../utils/response';
import { hasPermission } from '../utils/permissions';
import logger from '../utils/logger';
import pool from '../config/database';

/**
 * A signed token is only trusted while the account behind it is still valid:
 * not deleted or suspended, same role, and not revoked by a password change
 * (users.token_version). Tokens issued before token versions existed carry no
 * `tv` and count as version 0, so nobody is logged out when this ships.
 */
async function sessionIsValid(decoded: TokenPayload): Promise<boolean> {
  const r = await pool.query(
    'SELECT user_type, status, deleted_at, COALESCE(token_version, 0) AS token_version FROM users WHERE id = $1',
    [decoded.sub]
  );
  const u = r.rows[0];
  if (!u || u.deleted_at) return false;
  if (u.status === 'suspended' || u.status === 'deleted') return false;
  if (u.user_type !== decoded.role) return false;
  return Number(u.token_version) === Number(decoded.tv ?? 0);
}

export class AuthMiddleware {
  /**
   * Verify JWT token and attach user to request
   */
  static async verifyToken(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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

      if (!(await sessionIsValid(decoded))) {
        ResponseUtil.unauthorized(res, 'Session expired or revoked');
        return;
      }

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
  static async optionalAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
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
      if (!(await sessionIsValid(decoded))) {
        next();
        return;
      }

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
