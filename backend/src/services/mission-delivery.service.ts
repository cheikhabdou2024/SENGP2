import pool from '../config/database';
import { Mission, MissionStatus, NotificationType } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';
import QRCode from 'qrcode';
import crypto from 'crypto';
import axios from 'axios';
import { NotificationService } from './notification.service';
import { MissionService } from './mission.service';
import { missionIdFromPackageQr, tokenFromRecipientQr } from '../utils/qr';

/**
 * Proof of delivery: QR codes, recipient identity, GPS proof, the GP scan session.
 * The status machine itself (including the wallet credit) stays in MissionService.
 */
export class MissionDeliveryService {
  /**
   * Generate QR Code for mission
   */
  static async generateQRCode(missionId: string): Promise<string> {
    const mission = await MissionService.getById(missionId);

    if (!mission) {
      throw new Error('Mission not found');
    }

    const qrData = JSON.stringify({
      mission_code: mission.mission_code,
      tracking_number: mission.tracking_number,
      id: mission.id,
    });

    const qrCodeUrl = await QRCode.toDataURL(qrData);

    // Cache the QR on the mission. Best-effort: a write failure (e.g. a legacy
    // VARCHAR(500) qr_code_url column, before the TEXT patch) must NOT block
    // returning the generated QR to the expéditeur.
    try {
      await pool.query(
        'UPDATE missions SET qr_code_url = $1, qr_code_data = $2 WHERE id = $3',
        [qrCodeUrl, qrData, missionId]
      );
    } catch (e: any) {
      logger.warn(`Could not persist QR for mission ${missionId}: ${e.message}`);
    }

    return qrCodeUrl;
  }

  /**
   * Phase 2 — proof of delivery.
   * Ensure the mission has a secret `delivery_token` (carried by the package QR),
   * then return the public confirmation URL + a QR image (data URL) for it.
   */
  static async generateDeliveryQR(
    missionId: string,
    baseUrl: string
  ): Promise<{ token: string; confirm_url: string; qr_code_url: string }> {
    const mr = await pool.query(
      'SELECT id, delivery_token, expediteur_id, gp_id FROM missions WHERE id = $1',
      [missionId]
    );
    if (mr.rows.length === 0) throw new Error('Mission not found');
    let token = mr.rows[0].delivery_token;
    if (!token) {
      token = crypto.randomBytes(16).toString('hex');
      await pool.query('UPDATE missions SET delivery_token = $1 WHERE id = $2', [token, missionId]);
    }
    const confirm_url = `${baseUrl}/d/${token}`;
    const qr_code_url = await QRCode.toDataURL(confirm_url, { margin: 1, width: 320 });
    return { token, confirm_url, qr_code_url };
  }

  /** Public, minimal mission info for the delivery-confirmation page. */
  static async getDeliveryInfo(token: string): Promise<any> {
    const r = await pool.query(
      `SELECT mission_code, tracking_number, status,
              departure_city, arrival_city, arrival_country, package_weight,
              recipient_name
       FROM missions WHERE delivery_token = $1`,
      [token]
    );
    if (r.rows.length === 0) throw new Error('Not found');
    return r.rows[0];
  }

  /** Set/update the recipient identity (expediteur owner only). */
  static async setRecipient(
    missionId: string,
    expediteurId: string,
    name?: string,
    phone?: string
  ): Promise<any> {
    const r = await pool.query(
      `UPDATE missions SET recipient_name = $1, recipient_phone = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND expediteur_id = $4
       RETURNING id, recipient_name, recipient_phone`,
      [name || null, phone || null, missionId, expediteurId]
    );
    if (r.rows.length === 0) throw new Error('Mission not found or not yours');
    return r.rows[0];
  }

  /**
   * Recipient confirms delivery by scanning the package QR. Idempotent: if the
   * mission is already delivered, it's a no-op. Otherwise it runs the full
   * delivered transition (wallet credit, etc.) and records a proof entry.
   */
  static async confirmDeliveryByToken(
    token: string,
    proof: { lat?: number; lng?: number } = {}
  ): Promise<{ already: boolean }> {
    const r = await pool.query(
      `SELECT id, status, gp_id, expediteur_id, arrival_city, arrival_country
       FROM missions WHERE delivery_token = $1`,
      [token]
    );
    if (r.rows.length === 0) throw new Error('Not found');
    const m = r.rows[0];
    if (m.status === 'cancelled') throw new Error('Mission cancelled');
    if (m.status === 'delivered') return { already: true };

    // Anti-fraude : si le destinataire partage sa position, elle doit être proche
    // de la ville d'arrivée. (Si pas de GPS ou géocodage indisponible, on ne bloque pas.)
    if (proof.lat != null && proof.lng != null) {
      const dest = await this.geocodeCity(m.arrival_city, m.arrival_country);
      if (dest) {
        const km = this.haversineKm(proof.lat, proof.lng, dest.lat, dest.lng);
        const limit = parseFloat(process.env.DELIVERY_GEOFENCE_KM || '60');
        if (km > limit) {
          throw new Error(
            `Vous semblez loin du lieu de livraison (${m.arrival_city} · ~${Math.round(km)} km). ` +
            `Confirmez la réception une fois sur place avec le colis.`
          );
        }
      }
    }

    const actor = m.gp_id || m.expediteur_id;
    // Full delivered transition (credits GP wallet, etc.). Trusted internal call:
    // the recipient already proved delivery (token + geofence) above.
    await MissionService.updateStatus(m.id, MissionStatus.DELIVERED, actor, { internal: true });
    // Proof-of-delivery tracking entry (with the recipient's GPS if shared)
    await pool.query(
      `INSERT INTO mission_tracking (mission_id, status, latitude, longitude, description, created_by)
       VALUES ($1, 'delivered', $2, $3, 'Réception confirmée par le destinataire (QR)', $4)`,
      [m.id, proof.lat ?? null, proof.lng ?? null, actor]
    );
    return { already: false };
  }

  /** Process-level cache of geocoded city centres ("city,country" -> {lat,lng}). */
  private static geocodeCache: Map<string, { lat: number; lng: number } | null> = new Map();

  /** Geocode a city centre via OpenStreetMap Nominatim. Returns null on failure. */
  static async geocodeCity(
    city?: string,
    country?: string
  ): Promise<{ lat: number; lng: number } | null> {
    const q = [city, country].filter(Boolean).join(', ').trim();
    if (!q) return null;
    if (this.geocodeCache.has(q)) return this.geocodeCache.get(q) as any;
    try {
      const res = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q, format: 'json', limit: 1 },
        headers: { 'User-Agent': 'SENGP/1.0 (delivery-geofence)' },
        timeout: 6000,
      });
      const hit = Array.isArray(res.data) && res.data[0];
      const coords = hit ? { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) } : null;
      this.geocodeCache.set(q, coords);
      return coords;
    } catch (e) {
      logger.warn(`Geocoding failed for "${q}"`);
      return null; // ne pas bloquer la confirmation si le géocodage échoue
    }
  }

  /** Great-circle distance between two lat/lng points, in kilometres. */
  static haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /**
   * Verify QR code at delivery and mark mission as delivered
   */
  static async verifyDeliveryByQR(qrData: string, gpId: string): Promise<Mission> {
    let parsedData: any;
    try {
      parsedData = JSON.parse(qrData);
    } catch {
      throw new Error('Format QR code invalide');
    }

    const missionId = parsedData.id;
    if (!missionId) throw new Error('Données QR code invalides');

    // The scan must correspond to one of THIS GP's packages, not yet delivered.
    const mr = await pool.query(
      `SELECT id, gp_id, status, mission_code, expediteur_id, recipient_name,
              arrival_confirmed, offered_price, final_price
       FROM missions WHERE id = $1`,
      [missionId]
    );
    if (mr.rows.length === 0) throw new Error('Mission introuvable');
    const mission = mr.rows[0];
    if (mission.gp_id !== gpId) throw new Error('Ce colis ne fait pas partie de vos missions');
    if (mission.status === 'delivered') throw new Error('Ce colis a déjà été livré');
    if (mission.status === 'cancelled') throw new Error('Cette mission a été annulée');
    // Delivery is only allowed once the admin has confirmed the GP's arrival.
    if (!mission.arrival_confirmed) {
      throw new Error("En attente de la confirmation d'arrivée par l'administration.");
    }

    // Canonical delivered transition: credits the GP wallet from the upfront
    // payment, increments stats, sets the completion date and notifies the GP
    // of their earnings. Trusted internal call (the QR match is the proof).
    await MissionService.updateStatus(missionId, MissionStatus.DELIVERED, gpId, { internal: true });

    // Proof-of-delivery tracking entry (recipient's QR scanned by the GP).
    await pool.query(
      `INSERT INTO mission_tracking (mission_id, status, description, created_by)
       VALUES ($1, 'delivered', 'Colis livré — QR du destinataire scanné par le GP', $2)`,
      [missionId, gpId]
    );

    // Notify the expéditeur AND the admin(s) that the package reached the recipient.
    try {
      await NotificationService.create({
        user_id: mission.expediteur_id,
        notification_type: NotificationType.MISSION_DELIVERED,
        title: 'Colis livré',
        message: `Votre colis ${mission.mission_code} a été remis${mission.recipient_name ? ' à ' + mission.recipient_name : ' au destinataire'} (QR confirmé).`,
        action_url: 'suivi.html',
        metadata: { mission_id: missionId, mission_code: mission.mission_code },
      });
      // Amount for this mission + running total now owed to the GP (wallet).
      const amount = Number(mission.final_price ?? mission.offered_price) || 0;
      let gpTotal = 0;
      try {
        const w = await pool.query(
          'SELECT available_balance FROM wallet_balances WHERE user_id = $1',
          [gpId]
        );
        gpTotal = Number(w.rows[0]?.available_balance) || 0;
      } catch (e) { /* ignore */ }
      const admins = await pool.query(
        `SELECT id FROM users WHERE user_type = 'admin' AND deleted_at IS NULL`
      );
      for (const a of admins.rows) {
        await NotificationService.create({
          user_id: a.id,
          notification_type: NotificationType.MISSION_DELIVERED,
          title: 'Livraison confirmée',
          message: `Le colis ${mission.mission_code} a été livré (${Helpers.formatCurrency(amount)}). ` +
            `Total dû au GP : ${Helpers.formatCurrency(gpTotal)}.`,
          metadata: { mission_id: missionId, mission_code: mission.mission_code, amount, gp_total_due: gpTotal },
        });
      }
    } catch (e: any) {
      logger.warn('Delivery notification (expéditeur/admin) failed:', e.message);
    }

    return (await MissionService.getById(missionId)) as Mission;
  }

  /**
   * Compare the colis QR with the recipient's QR. Same mission → delivery is confirmed
   * (green check); otherwise match=false (red cross) and nothing is changed.
   */
  static async verifyPair(
    packageQr: string,
    recipientQr: string,
    gpId: string
  ): Promise<{ match: boolean; reason?: string; mission?: Mission }> {
    // Les deux QR peuvent être le même lien /d/<jeton> (ou l'ancien QR JSON du colis).
    const resolve = async (qr: string): Promise<string | null> => {
      const jsonId = missionIdFromPackageQr(qr);
      if (jsonId) return jsonId;
      const tok = tokenFromRecipientQr(qr);
      if (!tok) return null;
      const r = await pool.query('SELECT id FROM missions WHERE delivery_token = $1', [tok]);
      return r.rows.length ? String(r.rows[0].id) : null;
    };
    const pkgId = await resolve(packageQr);
    if (!pkgId) return { match: false, reason: 'QR du colis non reconnu.' };
    const rcpId = await resolve(recipientQr);
    if (!rcpId) return { match: false, reason: 'QR du destinataire non reconnu.' };
    if (pkgId !== rcpId) {
      return { match: false, reason: 'Le QR du colis ne correspond pas à celui du destinataire.' };
    }
    const mission = await this.verifyDeliveryByQR(JSON.stringify({ id: pkgId }), gpId);
    return { match: true, mission };
  }

  /** Is this GP locked until the admin validates the end of their scan? */
  static async isGpLocked(userId: string): Promise<boolean> {
    const r = await pool.query('SELECT scan_review_pending FROM gp_profiles WHERE user_id = $1', [userId]);
    return !!(r.rows[0] && r.rows[0].scan_review_pending);
  }

  /**
   * GP taps « Scan terminé » : lock the GP and ask the admin(s) to validate.
   */
  static async completeScan(gpId: string): Promise<{ locked: true; delivered: number; remaining: number }> {
    const gp = await pool.query('SELECT first_name, last_name FROM users WHERE id = $1', [gpId]);
    const prof = await pool.query('SELECT scan_released_at FROM gp_profiles WHERE user_id = $1', [gpId]);
    if (prof.rows.length === 0) throw new Error('Profil GP introuvable');
    const since = prof.rows[0].scan_released_at || new Date(Date.now() - 30 * 864e5);
    const del = await pool.query(
      "SELECT COUNT(*)::int AS n FROM missions WHERE gp_id = $1 AND status = 'delivered' AND completed_at >= $2",
      [gpId, since]
    );
    const rem = await pool.query(
      "SELECT COUNT(*)::int AS n FROM missions WHERE gp_id = $1 AND status IN ('picked_up','in_transit','out_for_delivery')",
      [gpId]
    );
    if (del.rows[0].n === 0) throw new Error('Aucun colis livré : scannez au moins un colis avant de terminer.');
    await pool.query(
      'UPDATE gp_profiles SET scan_review_pending = TRUE, scan_requested_at = CURRENT_TIMESTAMP WHERE user_id = $1',
      [gpId]
    );
    const name = gp.rows[0] ? gp.rows[0].first_name + ' ' + gp.rows[0].last_name : 'Un GP';
    try {
      const admins = await pool.query(`SELECT id FROM users WHERE user_type = 'admin' AND deleted_at IS NULL`);
      for (const a of admins.rows) {
        await NotificationService.create({
          user_id: a.id,
          notification_type: NotificationType.MISSION_TRANSIT,
          title: 'Scan terminé — validation requise',
          message: `${name} a terminé son scan : ${del.rows[0].n} colis livré(s), ${rem.rows[0].n} restant(s). Validez pour lui rendre l'accès à l'application.`,
          metadata: { gp_id: gpId },
        });
      }
    } catch (e: any) { logger.warn('Scan-complete admin notification failed:', e.message); }
    return { locked: true, delivered: del.rows[0].n, remaining: rem.rows[0].n };
  }
}
