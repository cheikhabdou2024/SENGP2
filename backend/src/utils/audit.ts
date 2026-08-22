import pool from '../config/database';
import logger from '../utils/logger';
import { AuthRequest } from '../types';

/**
 * Write an entry to the admin_logs table. Best-effort: an audit failure must
 * never break the action that triggered it, so this swallows its own errors.
 */
export async function logAdminAction(params: {
  req: AuthRequest;
  action: string;          // e.g. 'user.update', 'mission.assign'
  entityType: string;      // e.g. 'user', 'mission'
  entityId?: string | null;
  description?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    const adminId = params.req.user?.id;
    if (!adminId) return; // nothing to attribute the action to

    const ip =
      (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      params.req.ip ||
      null;
    const userAgent = (params.req.headers['user-agent'] as string) || null;

    await pool.query(
      `INSERT INTO admin_logs (admin_id, action, entity_type, entity_id, description, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        adminId,
        params.action,
        params.entityType,
        params.entityId || null,
        params.description || null,
        ip,
        userAgent,
        params.metadata ? JSON.stringify(params.metadata) : null,
      ]
    );
  } catch (e) {
    logger.warn(`Audit log failed for action ${params.action}: ${(e as Error).message}`);
  }
}
