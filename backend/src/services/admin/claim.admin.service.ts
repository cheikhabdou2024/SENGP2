import pool from '../../config/database';
import { Helpers } from '../../utils/helpers';
import { resolveEvidenceUrl } from '../../utils/s3';
import { NotificationService } from '../notification.service';
import { WalletService } from '../wallet.service';
import { NotificationType } from '../../types';
import logger from '../../utils/logger';

/** Réclamations et avis. */
export class AdminClaimService {
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
      `SELECT c.id, c.claim_code, c.claim_type, c.title, c.description, c.status, c.priority, c.resolution,
              c.compensation_amount, c.evidence_urls, c.created_at,
              u.first_name || ' ' || u.last_name AS claimant_name,
              m.mission_code
       FROM claims c
       LEFT JOIN users u ON c.claimant_id = u.id
       LEFT JOIN missions m ON c.mission_id = m.id
       ${where} ORDER BY c.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    // Presign stored evidence keys so the admin can play/download attachments.
    const data = rows.rows.map((r: any) => {
      let ev = r.evidence_urls;
      if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch (_) { ev = []; } }
      if (Array.isArray(ev)) r.evidence_urls = ev.map((v: string) => resolveEvidenceUrl(v));
      return r;
    });
    return { data, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
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

  /** Claim discussion thread: the claim + its messages (admin claimant). */
  static async getClaimThread(claimId: string) {
    const c = await pool.query(
      `SELECT c.*, u.first_name || ' ' || u.last_name AS claimant_name, u.email AS claimant_email,
              u.phone AS claimant_phone, u.user_type AS claimant_type, m.mission_code
         FROM claims c
         LEFT JOIN users u ON c.claimant_id = u.id
         LEFT JOIN missions m ON c.mission_id = m.id
        WHERE c.id = $1`, [claimId]
    );
    if (c.rows.length === 0) throw new Error('Claim not found');
    const claim = c.rows[0];
    let ev = claim.evidence_urls;
    if (typeof ev === 'string') { try { ev = JSON.parse(ev); } catch { ev = []; } }
    if (Array.isArray(ev)) claim.evidence_urls = ev.map((v: string) => resolveEvidenceUrl(v));
    const msgs = await pool.query(
      `SELECT cm.id, cm.message, cm.sender_role, cm.created_at,
              u.first_name || ' ' || u.last_name AS sender_name
         FROM claim_messages cm LEFT JOIN users u ON cm.sender_id = u.id
        WHERE cm.claim_id = $1 ORDER BY cm.created_at ASC`, [claimId]
    );
    return { claim, messages: msgs.rows };
  }

  /** Admin posts a reply on a claim; notifies the claimant. */
  static async addClaimMessage(claimId: string, adminId: string, message: string) {
    if (!message || !message.trim()) throw new Error('Message is required');
    const claim = await pool.query('SELECT id, claim_code, claimant_id FROM claims WHERE id = $1', [claimId]);
    if (claim.rows.length === 0) throw new Error('Claim not found');
    const ins = await pool.query(
      `INSERT INTO claim_messages (claim_id, sender_id, sender_role, message)
       VALUES ($1, $2, 'admin', $3) RETURNING id, message, sender_role, created_at`,
      [claimId, adminId, message.trim()]
    );
    // Keep the claim active while a conversation is ongoing.
    await pool.query(
      `UPDATE claims SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
              assigned_to = COALESCE(assigned_to, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [claimId, adminId]
    );
    try {
      await NotificationService.create({
        user_id: claim.rows[0].claimant_id,
        notification_type: NotificationType.SYSTEM_ALERT,
        title: `Réponse à votre réclamation ${claim.rows[0].claim_code}`,
        message: message.trim().slice(0, 140),
        action_url: 'reclamation.html',
      });
    } catch (e) { logger.warn(`Claim ${claimId} reply posted but notification failed`); }
    return ins.rows[0];
  }

  /**
   * Resolve a claim with a compensation amount. Records it on the claim and, when
   * the claimant is a GP (has a withdrawable wallet), credits their balance.
   */
  static async compensateClaim(claimId: string, adminId: string, amount: number, note?: string) {
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('A positive compensation amount is required');
    const c = await pool.query(
      `SELECT c.id, c.claim_code, c.claimant_id, u.user_type
         FROM claims c LEFT JOIN users u ON c.claimant_id = u.id WHERE c.id = $1`, [claimId]
    );
    if (c.rows.length === 0) throw new Error('Claim not found');
    const claim = c.rows[0];
    await pool.query(
      `UPDATE claims SET compensation_amount = $2, status = 'resolved', resolved_at = CURRENT_TIMESTAMP,
              assigned_to = COALESCE(assigned_to, $3),
              resolution = COALESCE(resolution, $4), updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [claimId, amt, adminId, note || null]
    );
    let credited = false;
    if (claim.user_type === 'gp') {
      await WalletService.getOrCreate(claim.claimant_id);
      await pool.query(
        `UPDATE wallet_balances SET available_balance = available_balance + $1,
                total_earned = total_earned + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2`,
        [amt, claim.claimant_id]
      );
      credited = true;
    }
    try {
      await NotificationService.create({
        user_id: claim.claimant_id,
        notification_type: NotificationType.CLAIM_RESOLVED,
        title: `Réclamation ${claim.claim_code} résolue`,
        message: credited
          ? `Une compensation de ${Helpers.formatCurrency(amt)} a été créditée sur votre portefeuille.`
          : `Une compensation de ${Helpers.formatCurrency(amt)} vous a été accordée. Notre équipe vous contactera pour le versement.`,
        action_url: 'reclamation.html',
      });
    } catch (e) { logger.warn(`Compensation set for claim ${claimId} but notification failed`); }
    return { id: claimId, compensation_amount: amt, credited };
  }

  // ---------- Reviews ----------
  static async listReviews(params: { page: number; limit: number; search?: string }) {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);
    let where = 'WHERE 1=1';
    const args: any[] = [];
    let i = 1;
    if (params.search) {
      where += ` AND (r.comment ILIKE $${i} OR m.mission_code ILIKE $${i}
                 OR ree.first_name ILIKE $${i} OR rer.first_name ILIKE $${i})`;
      args.push(`%${params.search}%`); i++;
    }
    const count = await pool.query(
      `SELECT COUNT(*) FROM reviews r LEFT JOIN missions m ON r.mission_id = m.id
        LEFT JOIN users rer ON r.reviewer_id = rer.id LEFT JOIN users ree ON r.reviewee_id = ree.id ${where}`, args);
    const total = parseInt(count.rows[0].count);
    const rows = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.review_type, r.created_at, m.mission_code,
              rer.first_name || ' ' || rer.last_name AS reviewer_name,
              ree.first_name || ' ' || ree.last_name AS reviewee_name
         FROM reviews r
         LEFT JOIN missions m ON r.mission_id = m.id
         LEFT JOIN users rer ON r.reviewer_id = rer.id
         LEFT JOIN users ree ON r.reviewee_id = ree.id
         ${where} ORDER BY r.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...args, limit, offset]
    );
    return { data: rows.rows, pagination: { page, limit, total, totalPages: Helpers.calculateTotalPages(total, limit) } };
  }

  /** Remove an abusive review and recompute the reviewee's rating aggregate. */
  static async deleteReview(id: string) {
    const r = await pool.query('DELETE FROM reviews WHERE id = $1 RETURNING reviewee_id', [id]);
    if (r.rows.length === 0) throw new Error('Review not found');
    const revieweeId = r.rows[0].reviewee_id;
    const agg = await pool.query(
      `SELECT COALESCE(AVG(rating), 0) AS avg, COUNT(*) AS cnt FROM reviews WHERE reviewee_id = $1`, [revieweeId]
    );
    await pool.query(
      `UPDATE users SET average_rating = $2, total_reviews = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [revieweeId, Number(agg.rows[0].avg).toFixed(2), parseInt(agg.rows[0].cnt)]
    );
    return { id, deleted: true };
  }
}
