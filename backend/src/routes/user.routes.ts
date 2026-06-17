import { Router } from 'express';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import pool from '../config/database';
import { resolveEvidenceUrl } from '../utils/s3';

const router = Router();

// All user routes require authentication
router.use(AuthMiddleware.verifyToken);

// GET /me - Get current user profile
router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;

    const result = await pool.query(
      `SELECT id, email, phone, user_type, first_name, last_name,
              country, city, status, is_email_verified, is_phone_verified,
              profile_photo_url, identity_document_type, identity_document_url,
              identity_document_url_back, created_at, last_login_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const u = result.rows[0];
    // Presign stored ID-card object keys for display.
    if (u.identity_document_url) u.identity_document_url = resolveEvidenceUrl(u.identity_document_url);
    if (u.identity_document_url_back) u.identity_document_url_back = resolveEvidenceUrl(u.identity_document_url_back);

    res.json({ success: true, data: u });
  } catch (error: any) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

// PUT /me - Update current user profile (name, phone, ID card)
router.put('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const allowed = ['first_name', 'last_name', 'phone', 'identity_document_type', 'identity_document_url', 'identity_document_url_back'];
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = $${i++}`); vals.push(req.body[k] === '' ? null : req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ success: false, error: 'Aucun champ à mettre à jour' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(userId);
    const r = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL
       RETURNING id, email, phone, user_type, first_name, last_name, country, city,
                 status, is_email_verified, profile_photo_url, identity_document_type,
                 identity_document_url, identity_document_url_back, created_at`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    const u = r.rows[0];
    if (u.identity_document_url) u.identity_document_url = resolveEvidenceUrl(u.identity_document_url);
    if (u.identity_document_url_back) u.identity_document_url_back = resolveEvidenceUrl(u.identity_document_url_back);
    res.json({ success: true, data: u, message: 'Profil mis à jour' });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, error: 'Ce numéro de téléphone est déjà utilisé' });
    }
    console.error('Error updating profile:', error);
    res.status(500).json({ success: false, error: 'Mise à jour échouée' });
  }
});

// GET /me/stats - Get user statistics
router.get('/me/stats', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const userType = req.user?.user_type;

    if (userType === 'expediteur') {
      // Stats for expediteur
      const missionsResult = await pool.query(
        `SELECT
          COUNT(*) as total_missions,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_missions,
          COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as in_transit_missions,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_missions
         FROM missions
         WHERE expediteur_id = $1`,
        [userId]
      );

      const stats = missionsResult.rows[0];

      const spentResult = await pool.query(
        `SELECT COALESCE(total_spent, 0) AS total_spent FROM expediteur_profiles WHERE user_id = $1`,
        [userId]
      );
      const revenue = Number(spentResult.rows[0]?.total_spent) || 0;

      res.json({
        success: true,
        data: {
          total_missions: parseInt(stats.total_missions) || 0,
          pending: parseInt(stats.pending_missions) || 0,
          in_transit: parseInt(stats.in_transit_missions) || 0,
          delivered: parseInt(stats.delivered_missions) || 0,
          revenue
        }
      });
    } else if (userType === 'gp') {
      // Stats for GP
      const missionsResult = await pool.query(
        `SELECT
          COUNT(*) as total_deliveries,
          COUNT(CASE WHEN status = 'accepted' THEN 1 END) as active_deliveries,
          COUNT(CASE WHEN status = 'delivered' THEN 1 END) as completed_deliveries
         FROM missions
         WHERE gp_id = $1`,
        [userId]
      );

      const stats = missionsResult.rows[0];

      const walletResult = await pool.query(
        `SELECT COALESCE(total_earned, 0) AS total_earned,
                COALESCE(available_balance, 0) AS available_balance
         FROM wallet_balances WHERE user_id = $1`,
        [userId]
      );
      const earnings = Number(walletResult.rows[0]?.total_earned) || 0;
      const available_balance = Number(walletResult.rows[0]?.available_balance) || 0;

      res.json({
        success: true,
        data: {
          total_deliveries: parseInt(stats.total_deliveries) || 0,
          active: parseInt(stats.active_deliveries) || 0,
          completed: parseInt(stats.completed_deliveries) || 0,
          earnings,
          available_balance
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          total_missions: 0,
          pending: 0,
          in_transit: 0,
          delivered: 0
        }
      });
    }
  } catch (error: any) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;
