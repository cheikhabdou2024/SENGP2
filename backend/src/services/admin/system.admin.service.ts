import pool from '../../config/database';
import bcrypt from 'bcryptjs';
import { Helpers } from '../../utils/helpers';
import { pushToSegment } from '../../utils/webpush';
import { safeEqual } from '../../utils/safeEqual';

/** Journal d’audit, diffusion, paramètres de la plateforme, amorçage admin. */
export class AdminSystemService {
  // ---------- Audit log ----------
  static async listAudit(params: { page: number; limit: number; search?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.search) {
      where += ` AND (l.action ILIKE $${i} OR l.entity_type ILIKE $${i} OR l.description ILIKE $${i}
                 OR a.email ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM admin_logs l LEFT JOIN users a ON l.admin_id = a.id ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT l.id, l.action, l.entity_type, l.entity_id, l.description, l.ip_address,
              l.metadata, l.created_at,
              a.first_name || ' ' || a.last_name AS admin_name, a.email AS admin_email
         FROM admin_logs l
         LEFT JOIN users a ON l.admin_id = a.id
         ${where} ORDER BY l.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  // ---------- Broadcast ----------
  /** Send a notification to a user segment. Returns the number of recipients. */
  static async sendBroadcast(adminId: string, params: { audience: string; title: string; message: string }) {
    const { audience, title, message } = params;
    if (!title || !title.trim() || !message || !message.trim()) throw new Error('title and message are required');
    let seg = 'deleted_at IS NULL';
    if (['expediteur', 'gp', 'admin'].includes(audience)) seg += ` AND user_type = '${audience}'`;
    else if (['verified', 'pending', 'suspended'].includes(audience)) seg += ` AND status = '${audience}'`;
    else if (audience && audience !== 'all') throw new Error('Invalid audience');
    const r = await pool.query(
      `INSERT INTO notifications (user_id, notification_type, title, message)
       SELECT id, 'system_alert', $1, $2 FROM users WHERE ${seg}`,
      [title.trim(), message.trim()]
    );
    // Best-effort Web Push to subscribed devices in the same segment.
    let pushed = 0;
    try { pushed = await pushToSegment(seg, { title: title.trim(), body: message.trim(), url: 'notifications.html' }); }
    catch (e) { /* pushToSegment already swallows its own errors */ }
    return { recipients: r.rowCount || 0, pushed, audience: audience || 'all' };
  }

  // ---------- Platform settings ----------
  static SETTING_DEFAULTS: Record<string, any> = {
    commission_pct: Number(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 15,
    insurance_pct: Number(process.env.INSURANCE_FEE_PERCENTAGE) || 2,
    min_withdrawal: Number(process.env.MIN_WITHDRAWAL_AMOUNT) || 5000,
    supported_countries: ['Sénégal', 'France', 'USA', 'Canada', 'Maroc', 'Côte d\'Ivoire', 'Mali'],
  };

  static async getSettings() {
    const r = await pool.query('SELECT key, value, updated_at FROM platform_setting');
    const stored: Record<string, any> = {};
    r.rows.forEach((row: any) => { stored[row.key] = row.value; });
    const settings: Record<string, any> = {};
    for (const k of Object.keys(this.SETTING_DEFAULTS)) settings[k] = (k in stored) ? stored[k] : this.SETTING_DEFAULTS[k];
    return settings;
  }

  static async updateSettings(data: any, adminId: string) {
    const allowed = Object.keys(this.SETTING_DEFAULTS);
    const keys = Object.keys(data || {}).filter(k => allowed.includes(k));
    if (keys.length === 0) throw new Error('No valid settings provided');
    for (const k of keys) {
      await pool.query(
        `INSERT INTO platform_setting (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`,
        [k, JSON.stringify(data[k]), adminId]
      );
    }
    return this.getSettings();
  }

  /**
   * One-time bootstrap: promote an existing user to ADMIN using a shared secret.
   * Guarded by ADMIN_BOOTSTRAP_SECRET (so it cannot be abused without the secret).
   * The promoted user is given the super_admin role so they get full permissions.
   */
  static async bootstrapAdmin(email: string, secret: string) {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) throw new Error('Admin bootstrap is not configured');
    if (!safeEqual(String(secret ?? ''), expected)) throw new Error('Invalid bootstrap secret');
    const result = await pool.query(
      `UPDATE users
          SET user_type = 'admin', status = 'verified',
              admin_role_id = COALESCE(admin_role_id, (SELECT id FROM admin_role WHERE key = 'super_admin')),
              updated_at = CURRENT_TIMESTAMP
        WHERE email = $1 AND deleted_at IS NULL
        RETURNING id, email, user_type`,
      [String(email).toLowerCase()]
    );
    if (result.rows.length === 0) throw new Error('No user found with that email');
    return result.rows[0];
  }

  /**
   * Secret-gated password reset (recovery when no email flow exists). Guarded by
   * ADMIN_BOOTSTRAP_SECRET so it cannot be abused without the shared secret.
   */
  static async resetPassword(email: string, secret: string, newPassword: string) {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) throw new Error('Password reset is not configured');
    if (!safeEqual(String(secret ?? ''), expected)) throw new Error('Invalid bootstrap secret');
    if (!newPassword || String(newPassword).length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const hash = await bcrypt.hash(String(newPassword), 12);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
       WHERE email = $2 AND deleted_at IS NULL
       RETURNING id, email, user_type`,
      [hash, String(email).toLowerCase()]
    );
    if (result.rows.length === 0) throw new Error('No user found with that email');
    return result.rows[0];
  }
}
