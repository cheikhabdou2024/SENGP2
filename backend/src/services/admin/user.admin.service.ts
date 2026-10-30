import pool from '../../config/database';
import bcrypt from 'bcryptjs';
import { Helpers } from '../../utils/helpers';
import { resolveEvidenceUrl } from '../../utils/s3';
import { NotificationService } from '../notification.service';
import { NotificationType } from '../../types';
import logger from '../../utils/logger';

/** Utilisateurs et vérification d’identité (KYC). */
export class AdminUserService {
  // ---------- Users ----------
  static async listUsers(params: { page: number; limit: number; search?: string; user_type?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE deleted_at IS NULL';
    const args: any[] = [];
    let i = 1;
    if (params.user_type) { where += ` AND user_type = $${i++}`; args.push(params.user_type); }
    if (params.status) { where += ` AND status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i} OR phone ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM users ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT id, email, phone, user_type, first_name, last_name, status,
              is_email_verified, country, city, average_rating, created_at, last_login_at
       FROM users ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  /** Daily signup counts split by current status — for the Users KPI sparklines. */
  static async getUserStatusSeries(from: string, to: string, interval: string) {
    const unit = ['day', 'week', 'month'].includes(interval) ? interval : 'day';
    const r = await pool.query(
      `SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'verified') AS verified,
              COUNT(*) FILTER (WHERE status = 'pending') AS pending,
              COUNT(*) FILTER (WHERE status = 'suspended') AS suspended
         FROM users
        WHERE deleted_at IS NULL
          AND created_at >= ($1)::date AND created_at < (($2)::date + interval '1 day')
        GROUP BY 1 ORDER BY 1`,
      [from, to, unit]
    );
    const series = r.rows.map((x: any) => ({ period: x.period, total: +x.total, verified: +x.verified, pending: +x.pending, suspended: +x.suspended }));
    const totals = series.reduce((t: any, s: any) => ({ total: t.total+s.total, verified: t.verified+s.verified, pending: t.pending+s.pending, suspended: t.suspended+s.suspended }), { total:0, verified:0, pending:0, suspended:0 });
    return { series, totals };
  }

  /** All users matching filters (no pagination) — for CSV export. */
  static async listUsersForExport(params: { search?: string; user_type?: string; status?: string }) {
    let where = 'WHERE deleted_at IS NULL';
    const args: any[] = [];
    let i = 1;
    if (params.user_type) { where += ` AND user_type = $${i++}`; args.push(params.user_type); }
    if (params.status) { where += ` AND status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i} OR phone ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const r = await pool.query(
      `SELECT first_name || ' ' || last_name AS name, email, phone, user_type, status,
              is_email_verified, country, city, created_at, last_login_at
         FROM users ${where} ORDER BY created_at DESC`,
      args
    );
    return r.rows;
  }

  static async updateUser(id: string, data: any) {
    const allowed = ['first_name', 'last_name', 'phone', 'user_type', 'status', 'country', 'city', 'is_email_verified'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (data.password) {
      const hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      sets.push(`password_hash = $${i++}`); args.push(hash);
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
       RETURNING id, email, phone, user_type, first_name, last_name, status, is_email_verified, country, city`,
      args
    );
    if (result.rows.length === 0) throw new Error('User not found');
    return result.rows[0];
  }

  /** Soft-delete a user (keeps referential integrity for missions/payments). */
  static async deleteUser(id: string) {
    const result = await pool.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, status = 'suspended'
       WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) throw new Error('User not found');
    return { id, deleted: true };
  }

  /** Full user detail: profile, KYC docs (presigned), and activity summary. */
  static async getUserDetail(id: string) {
    const u = await pool.query(
      `SELECT id, email, phone, user_type, first_name, last_name, date_of_birth,
              profile_photo_url, status, is_email_verified, is_phone_verified,
              identity_document_type, identity_document_url, identity_document_url_back,
              identity_verified_at, verified_by, country, city, address,
              average_rating, total_reviews, created_at, last_login_at
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (u.rows.length === 0) throw new Error('User not found');
    const user = u.rows[0];
    if (user.identity_document_url) user.identity_document_url = resolveEvidenceUrl(user.identity_document_url);
    if (user.identity_document_url_back) user.identity_document_url_back = resolveEvidenceUrl(user.identity_document_url_back);

    const profileTable = user.user_type === 'gp' ? 'gp_profiles' : user.user_type === 'expediteur' ? 'expediteur_profiles' : null;
    let profile = null;
    if (profileTable) {
      const pr = await pool.query(`SELECT * FROM ${profileTable} WHERE user_id = $1`, [id]);
      profile = pr.rows[0] || null;
    }

    const [asExp, asGp, pay, claims, recent] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM missions WHERE expediteur_id = $1`, [id]),
      pool.query(`SELECT COUNT(*) FROM missions WHERE gp_id = $1`, [id]),
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE payer_id = $1 AND status = 'completed'`, [id]),
      pool.query(`SELECT COUNT(*) FROM claims WHERE claimant_id = $1`, [id]),
      pool.query(
        `SELECT id, mission_code, status, departure_city, arrival_city, offered_price AS price, created_at
           FROM missions WHERE expediteur_id = $1 OR gp_id = $1
          ORDER BY created_at DESC LIMIT 5`, [id]),
    ]);

    return {
      user,
      profile,
      stats: {
        missions_as_expediteur: parseInt(asExp.rows[0].count),
        missions_as_gp: parseInt(asGp.rows[0].count),
        total_paid: pay.rows[0].total,
        claims: parseInt(claims.rows[0].count),
      },
      recent_missions: recent.rows,
    };
  }

  /** Admin creates a user directly (with profile + wallet, like registration). */
  static async createUser(data: any) {
    const required = ['email', 'password', 'user_type', 'first_name', 'last_name'];
    for (const f of required) if (!data[f]) throw new Error(`${f} is required`);
    if (!['expediteur', 'gp', 'admin'].includes(data.user_type)) throw new Error('Invalid user_type');
    if (String(data.password).length < 8) throw new Error('Password must be at least 8 characters');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const dup = await client.query('SELECT id FROM users WHERE email = $1', [String(data.email).toLowerCase()]);
      if (dup.rows.length) throw new Error('Email already registered');
      const hash = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      const ins = await client.query(
        `INSERT INTO users (email, phone, password_hash, user_type, first_name, last_name, country, city, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified')
         RETURNING id, email, phone, user_type, first_name, last_name, status, created_at`,
        [String(data.email).toLowerCase(), data.phone || null, hash, data.user_type,
         data.first_name, data.last_name, data.country || null, data.city || null]
      );
      const nu = ins.rows[0];
      if (data.user_type === 'gp') {
        await client.query('INSERT INTO gp_profiles (user_id) VALUES ($1)', [nu.id]);
        await client.query('INSERT INTO wallet_balances (user_id) VALUES ($1)', [nu.id]);
      } else if (data.user_type === 'expediteur') {
        await client.query('INSERT INTO expediteur_profiles (user_id) VALUES ($1)', [nu.id]);
      }
      await client.query('COMMIT');
      return nu;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ---------- KYC / identity verification ----------
  /** Users who uploaded an ID document but are not yet verified. */
  static async listKyc(params: { page: number; limit: number; search?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = `WHERE deleted_at IS NULL AND identity_verified_at IS NULL
                 AND (identity_document_url IS NOT NULL OR identity_document_url_back IS NOT NULL)`;
    const args: any[] = [];
    let i = 1;
    if (params.search) {
      where += ` AND (email ILIKE $${i} OR first_name ILIKE $${i} OR last_name ILIKE $${i} OR phone ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM users ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT id, email, phone, first_name, last_name, user_type, status, country, city,
              identity_document_type, identity_document_url, identity_document_url_back,
              is_email_verified, created_at
         FROM users ${where} ORDER BY created_at ASC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    const data = rows.rows.map((r: any) => {
      if (r.identity_document_url) r.identity_document_url = resolveEvidenceUrl(r.identity_document_url);
      if (r.identity_document_url_back) r.identity_document_url_back = resolveEvidenceUrl(r.identity_document_url_back);
      return r;
    });
    return { data, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async approveKyc(userId: string, adminId: string) {
    const r = await pool.query(
      `UPDATE users
          SET identity_verified_at = CURRENT_TIMESTAMP, verified_by = $2,
              status = CASE WHEN status = 'pending' THEN 'verified' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, email, first_name, user_type`,
      [userId, adminId]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    try {
      await NotificationService.create({
        user_id: userId,
        notification_type: NotificationType.ACCOUNT_VERIFIED,
        title: 'Identité vérifiée',
        message: 'Votre pièce d\'identité a été validée. Votre compte est maintenant vérifié.',
        action_url: 'profile.html',
      });
    } catch (e) { logger.warn(`KYC approved for ${userId} but notification failed`); }
    return r.rows[0];
  }

  static async rejectKyc(userId: string, adminId: string, reason?: string) {
    const r = await pool.query(
      `UPDATE users
          SET identity_document_url = NULL, identity_document_url_back = NULL,
              identity_verified_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id, email, first_name`,
      [userId]
    );
    if (r.rows.length === 0) throw new Error('User not found');
    try {
      await NotificationService.create({
        user_id: userId,
        notification_type: NotificationType.SYSTEM_ALERT,
        title: 'Pièce d\'identité refusée',
        message: reason
          ? `Votre pièce d'identité a été refusée : ${reason}. Merci de la soumettre à nouveau.`
          : 'Votre pièce d\'identité a été refusée. Merci de la soumettre à nouveau.',
        action_url: 'profile.html',
      });
    } catch (e) { logger.warn(`KYC rejected for ${userId} but notification failed`); }
    return { id: r.rows[0].id, rejected: true };
  }
}
