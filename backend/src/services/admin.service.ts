import pool from '../config/database';
import bcrypt from 'bcryptjs';
import { Helpers } from '../utils/helpers';

/**
 * Admin service: read-only global overview + full CRUD over the main entities.
 * All methods assume the caller has already been authorised as ADMIN.
 */
export class AdminService {
  /** Global dashboard overview (counts and money totals). */
  static async getStats() {
    const [users, missions, trips, payments, withdrawals, claims] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
          COUNT(*) FILTER (WHERE user_type = 'expediteur' AND deleted_at IS NULL) AS expediteurs,
          COUNT(*) FILTER (WHERE user_type = 'gp' AND deleted_at IS NULL) AS gps,
          COUNT(*) FILTER (WHERE user_type = 'admin' AND deleted_at IS NULL) AS admins,
          COUNT(*) FILTER (WHERE status = 'suspended' AND deleted_at IS NULL) AS suspended
        FROM users`),
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
          COUNT(*) FILTER (WHERE status = 'in_transit') AS in_transit,
          COUNT(*) FILTER (WHERE status = 'delivered') AS delivered,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM missions`),
      pool.query(`SELECT COUNT(*) AS total FROM trips`),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
          COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS gross_volume,
          COALESCE(SUM(commission) FILTER (WHERE status = 'completed'), 0) AS commission_total
        FROM payments`),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount
        FROM withdrawals`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'open') AS open FROM claims`),
    ]);

    return {
      users: users.rows[0],
      missions: missions.rows[0],
      trips: trips.rows[0],
      payments: payments.rows[0],
      withdrawals: withdrawals.rows[0],
      claims: claims.rows[0],
    };
  }

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

  // ---------- Missions ----------
  static async listMissions(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND m.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (m.mission_code ILIKE $${i} OR m.departure_city ILIKE $${i} OR m.arrival_city ILIKE $${i} OR m.tracking_number ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM missions m ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT m.id, m.mission_code, m.status, m.departure_city, m.arrival_city,
              m.offered_price AS price, m.package_weight AS weight, m.tracking_number, m.created_at,
              e.first_name || ' ' || e.last_name AS expediteur_name,
              g.first_name || ' ' || g.last_name AS gp_name
       FROM missions m
       LEFT JOIN users e ON m.expediteur_id = e.id
       LEFT JOIN users g ON m.gp_id = g.id
       ${where} ORDER BY m.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async updateMission(id: string, data: any) {
    const allowed = ['status', 'final_price', 'offered_price'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const result = await pool.query(`UPDATE missions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, args);
    if (result.rows.length === 0) throw new Error('Mission not found');
    return result.rows[0];
  }

  static async deleteMission(id: string) {
    await pool.query(`DELETE FROM mission_tracking WHERE mission_id = $1`, [id]);
    const result = await pool.query(`DELETE FROM missions WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) throw new Error('Mission not found');
    return { id, deleted: true };
  }

  // ---------- Trips ----------
  static async listTrips(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND t.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (t.trip_code ILIKE $${i} OR t.departure_city ILIKE $${i} OR t.arrival_city ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM trips t ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT t.id, t.trip_code, t.status, t.departure_city, t.arrival_city,
              t.departure_date, t.arrival_date, t.available_weight, t.current_packages, t.max_packages,
              g.first_name || ' ' || g.last_name AS gp_name
       FROM trips t LEFT JOIN users g ON t.gp_id = g.id
       ${where} ORDER BY t.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async deleteTrip(id: string) {
    const result = await pool.query(`DELETE FROM trips WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) throw new Error('Trip not found (it may have linked missions)');
    return { id, deleted: true };
  }

  // ---------- Payments (read-only) ----------
  static async listPayments(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND p.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (p.payment_code ILIKE $${i} OR p.external_transaction_id ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM payments p ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT p.id, p.payment_code, p.amount, p.commission, p.net_amount, p.currency,
              p.payment_method, p.status, p.transaction_type, p.created_at,
              payer.first_name || ' ' || payer.last_name AS payer_name,
              payee.first_name || ' ' || payee.last_name AS payee_name
       FROM payments p
       LEFT JOIN users payer ON p.payer_id = payer.id
       LEFT JOIN users payee ON p.payee_id = payee.id
       ${where} ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  // ---------- Claims ----------
  static async listClaims(params: { page: number; limit: number; search?: string; status?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.status) { where += ` AND c.status = $${i++}`; args.push(params.status); }
    if (params.search) {
      where += ` AND (c.claim_code ILIKE $${i} OR c.title ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(`SELECT COUNT(*) FROM claims c ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT c.id, c.claim_code, c.claim_type, c.title, c.status, c.priority, c.resolution,
              c.compensation_amount, c.created_at,
              u.first_name || ' ' || u.last_name AS claimant_name,
              m.mission_code
       FROM claims c
       LEFT JOIN users u ON c.claimant_id = u.id
       LEFT JOIN missions m ON c.mission_id = m.id
       ${where} ORDER BY c.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  static async updateClaim(id: string, adminId: string, data: any) {
    const allowed = ['status', 'priority', 'resolution', 'compensation_amount'];
    const sets: string[] = [];
    const args: any[] = [];
    let i = 1;
    for (const key of allowed) {
      if (data[key] !== undefined) { sets.push(`${key} = $${i++}`); args.push(data[key]); }
    }
    if (sets.length === 0) throw new Error('No updatable fields provided');
    sets.push(`assigned_to = $${i++}`); args.push(adminId);
    if (data.status === 'resolved' || data.status === 'closed') sets.push(`resolved_at = CURRENT_TIMESTAMP`);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    args.push(id);
    const result = await pool.query(`UPDATE claims SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, args);
    if (result.rows.length === 0) throw new Error('Claim not found');
    return result.rows[0];
  }

  /**
   * One-time bootstrap: promote an existing user to ADMIN using a shared secret.
   * Guarded by ADMIN_BOOTSTRAP_SECRET (so it cannot be abused without the secret).
   */
  static async bootstrapAdmin(email: string, secret: string) {
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected) throw new Error('Admin bootstrap is not configured');
    if (secret !== expected) throw new Error('Invalid bootstrap secret');
    const result = await pool.query(
      `UPDATE users SET user_type = 'admin', status = 'verified', updated_at = CURRENT_TIMESTAMP
       WHERE email = $1 AND deleted_at IS NULL
       RETURNING id, email, user_type`,
      [String(email).toLowerCase()]
    );
    if (result.rows.length === 0) throw new Error('No user found with that email');
    return result.rows[0];
  }
}
