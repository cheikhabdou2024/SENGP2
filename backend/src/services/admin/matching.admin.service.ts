import pool from '../../config/database';
import { AdminMissionService } from './mission.admin.service';

/** Mise en relation : missions à affecter et trajets de GP vers la même destination. */
export class AdminMatchingService {
  /**
   * Missions en attente d'affectation, chacune avec les trajets compatibles :
   * même pays d'arrivée, trajet ouvert et à venir, GP non verrouillé, place et poids restants
   * suffisants. Les trajets vers la même ville passent en premier, puis par date de départ.
   */
  static async getMatching() {
    const missions = await pool.query(
      `SELECT m.id, m.mission_code, m.departure_city, m.arrival_city, m.arrival_country,
              m.package_weight, m.offered_price, m.final_price, m.desired_departure_date, m.created_at,
              e.first_name || ' ' || e.last_name AS expediteur_name
         FROM missions m LEFT JOIN users e ON e.id = m.expediteur_id
        WHERE m.status = 'pending'
        ORDER BY m.created_at ASC
        LIMIT 200`
    );

    const trips = await pool.query(
      `SELECT t.id AS trip_id, t.trip_code, t.gp_id, t.departure_city, t.departure_country,
              t.arrival_city, t.arrival_country, t.departure_date, t.available_weight, t.max_packages,
              g.first_name || ' ' || g.last_name AS gp_name, g.phone AS gp_phone,
              g.average_rating,
              COALESCE(u.used_weight, 0) AS used_weight, COALESCE(u.used_count, 0) AS used_count
         FROM trips t
         JOIN users g ON g.id = t.gp_id AND g.deleted_at IS NULL
         LEFT JOIN gp_profiles gp ON gp.user_id = t.gp_id
         LEFT JOIN LATERAL (
           SELECT SUM(m.package_weight) AS used_weight, COUNT(*) AS used_count
             FROM missions m
            WHERE m.trip_id = t.id AND m.status NOT IN ('cancelled', 'pending', 'delivered')
         ) u ON TRUE
        WHERE t.status IN ('published', 'active')
          AND t.departure_date >= NOW() - INTERVAL '1 day'
          AND COALESCE(gp.scan_review_pending, FALSE) = FALSE
        ORDER BY t.departure_date ASC`
    );

    const norm = (v: any) => String(v || '').trim().toLowerCase();
    const open = trips.rows.map(t => ({
      ...t,
      free_weight: Number(t.available_weight) - Number(t.used_weight),
      free_slots: Number(t.max_packages) - Number(t.used_count),
    }));

    const rows = missions.rows.map(m => {
      const candidates = open
        .filter(t => norm(t.arrival_country) === norm(m.arrival_country)
          && t.free_slots > 0 && t.free_weight >= Number(m.package_weight))
        .map(t => ({ ...t, same_city: norm(t.arrival_city) === norm(m.arrival_city) }))
        .sort((a, b) => Number(b.same_city) - Number(a.same_city)
          || new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime());
      return { ...m, candidates };
    });

    return { missions: rows, open_trips: open.length };
  }

  /**
   * Affecte plusieurs missions d'un coup. Chaque affectation est indépendante : une
   * mission déjà prise n'empêche pas les autres.
   */
  static async bulkAssign(assignments: Array<{ mission_id: string; gp_id: string; trip_id?: string }>) {
    const results: Array<{ mission_id: string; ok: boolean; error?: string }> = [];
    for (const a of assignments) {
      try {
        await AdminMissionService.assignMission(a.mission_id, a.gp_id, a.trip_id);
        results.push({ mission_id: a.mission_id, ok: true });
      } catch (e: any) {
        results.push({ mission_id: a.mission_id, ok: false, error: e.message });
      }
    }
    return results;
  }
}
