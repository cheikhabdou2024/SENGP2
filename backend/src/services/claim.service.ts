import pool from '../config/database';
import { Claim, ClaimStatus, ClaimType, PaginatedResult } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maps the claim-type values the frontend selects to the `claim_type` DB enum.
 * The two reclamation pages use different (and partly non-canonical) values, so
 * anything unrecognized falls back to `other`.
 */
const CLAIM_TYPE_MAP: Record<string, ClaimType> = {
  // reclamation.html (expediteur)
  damaged: ClaimType.DAMAGED_PACKAGE,
  lost: ClaimType.LOST_PACKAGE,
  delay: ClaimType.DELAYED_DELIVERY,
  tracking: ClaimType.TRACKING_ISSUE,
  // reclamationgp.html (GP)
  payment_issue: ClaimType.PAYMENT_ISSUE,
  package_issue: ClaimType.DAMAGED_PACKAGE,
  delivery_issue: ClaimType.DELAYED_DELIVERY,
  sender_issue: ClaimType.OTHER,
  // canonical enum values (passed through)
  damaged_package: ClaimType.DAMAGED_PACKAGE,
  lost_package: ClaimType.LOST_PACKAGE,
  delayed_delivery: ClaimType.DELAYED_DELIVERY,
  wrong_delivery: ClaimType.WRONG_DELIVERY,
  tracking_issue: ClaimType.TRACKING_ISSUE,
  other: ClaimType.OTHER,
};

export class ClaimService {
  static normalizeClaimType(value?: string): ClaimType {
    if (!value) return ClaimType.OTHER;
    return CLAIM_TYPE_MAP[value.trim().toLowerCase()] || ClaimType.OTHER;
  }

  /**
   * Resolve a mission reference (UUID or human mission_code) to its row.
   */
  private static async resolveMission(ref: string): Promise<{ id: string; mission_code: string }> {
    const isUuid = UUID_REGEX.test(ref);
    const result = await pool.query(
      isUuid
        ? 'SELECT id, mission_code FROM missions WHERE id = $1'
        : 'SELECT id, mission_code FROM missions WHERE mission_code = $1',
      [ref]
    );

    if (result.rows.length === 0) {
      throw new Error('Mission not found');
    }

    return result.rows[0];
  }

  /**
   * Create a new claim.
   */
  static async create(data: any, claimantId: string): Promise<Claim> {
    const mission = await this.resolveMission(data.mission_id || data.mission_code);
    const claim_type = this.normalizeClaimType(data.claim_type);
    const claim_code = Helpers.generateCode('CLM');
    const title =
      (data.title && String(data.title).trim()) ||
      `Réclamation: ${claim_type.replace(/_/g, ' ')}`;

    // Optional attachments (e.g. a voice message stored as a data URL).
    const evidence = Array.isArray(data.evidence_urls) ? data.evidence_urls : null;

    const result = await pool.query(
      `INSERT INTO claims (claim_code, mission_id, claimant_id, claim_type, title, description, evidence_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [claim_code, mission.id, claimantId, claim_type, title, data.description, evidence ? JSON.stringify(evidence) : null]
    );

    const claim = result.rows[0];

    logger.info(`Claim created: ${claim.claim_code} by user ${claimantId}`);

    return { ...claim, claim_id: claim.claim_code, mission_code: mission.mission_code };
  }

  /**
   * Get claim by ID (with mission and claimant details).
   */
  static async getById(id: string): Promise<Claim | null> {
    const result = await pool.query(
      `SELECT c.*,
              c.claim_code AS claim_id,
              m.mission_code,
              cl.first_name || ' ' || cl.last_name AS claimant_name,
              cl.phone AS claimant_phone,
              a.first_name || ' ' || a.last_name AS assigned_to_name
       FROM claims c
       LEFT JOIN missions m ON c.mission_id = m.id
       LEFT JOIN users cl ON c.claimant_id = cl.id
       LEFT JOIN users a ON c.assigned_to = a.id
       WHERE c.id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get claims with pagination and filters.
   */
  static async getAll(params: {
    page: number;
    limit: number;
    status?: ClaimStatus;
    claimant_id?: string;
    claim_type?: ClaimType;
    priority?: string;
  }): Promise<PaginatedResult<Claim>> {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);

    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.status) {
      whereClause += ` AND c.status = $${paramIndex}`;
      queryParams.push(params.status);
      paramIndex++;
    }

    if (params.claimant_id) {
      whereClause += ` AND c.claimant_id = $${paramIndex}`;
      queryParams.push(params.claimant_id);
      paramIndex++;
    }

    if (params.claim_type) {
      whereClause += ` AND c.claim_type = $${paramIndex}`;
      queryParams.push(params.claim_type);
      paramIndex++;
    }

    if (params.priority) {
      whereClause += ` AND c.priority = $${paramIndex}`;
      queryParams.push(params.priority);
      paramIndex++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM claims c ${whereClause}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT c.*,
             c.claim_code AS claim_id,
             m.mission_code,
             cl.first_name || ' ' || cl.last_name AS claimant_name
      FROM claims c
      LEFT JOIN missions m ON c.mission_id = m.id
      LEFT JOIN users cl ON c.claimant_id = cl.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const result = await pool.query(dataQuery, [...queryParams, limit, offset]);

    return {
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Helpers.calculateTotalPages(total, limit),
      },
    };
  }

  /**
   * Update a claim. Admins may edit any field; the claimant may only edit their
   * own claim's descriptive fields.
   */
  static async update(
    id: string,
    userId: string,
    isAdmin: boolean,
    data: Partial<Claim>
  ): Promise<Claim> {
    const existing = await pool.query('SELECT claimant_id FROM claims WHERE id = $1', [id]);

    if (existing.rows.length === 0) {
      throw new Error('Claim not found');
    }

    if (!isAdmin && existing.rows[0].claimant_id !== userId) {
      throw new Error('You can only update your own claims');
    }

    const ownerFields = ['title', 'description', 'evidence_urls'];
    const adminFields = ['status', 'priority', 'assigned_to', 'resolution', 'compensation_amount'];
    const allowed = isAdmin ? [...ownerFields, ...adminFields] : ownerFields;

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && allowed.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(key === 'evidence_urls' && typeof value !== 'string' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE claims SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    logger.info(`Claim updated: ${id}`);
    return result.rows[0];
  }

  /**
   * Resolve (or reject/close) a claim. Admin only.
   */
  static async resolve(
    id: string,
    adminId: string,
    data: { resolution: string; status?: ClaimStatus; compensation_amount?: number }
  ): Promise<Claim> {
    const status = data.status || ClaimStatus.RESOLVED;

    const result = await pool.query(
      `UPDATE claims
       SET status = $1,
           resolution = $2,
           compensation_amount = $3,
           assigned_to = COALESCE(assigned_to, $4),
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [status, data.resolution, data.compensation_amount ?? null, adminId, id]
    );

    if (result.rows.length === 0) {
      throw new Error('Claim not found');
    }

    logger.info(`Claim ${id} ${status} by admin ${adminId}`);
    return result.rows[0];
  }
}
