import pool from '../../config/database';

/** Indicateurs globaux et séries temporelles. */
export class AdminAnalyticsService {
  /** Global dashboard overview (counts and money totals). */
  static async getStats() {
    const [users, missions, trips, payments, withdrawals, claims] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total,
          COUNT(*) FILTER (WHERE user_type = 'expediteur' AND deleted_at IS NULL) AS expediteurs,
          COUNT(*) FILTER (WHERE user_type = 'gp' AND deleted_at IS NULL) AS gps,
          COUNT(*) FILTER (WHERE user_type = 'admin' AND deleted_at IS NULL) AS admins,
          COUNT(*) FILTER (WHERE status = 'verified' AND deleted_at IS NULL) AS verified,
          COUNT(*) FILTER (WHERE status = 'pending' AND deleted_at IS NULL) AS pending,
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
      pool.query(`
        SELECT COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'published') AS published,
          COUNT(*) FILTER (WHERE status = 'draft') AS draft,
          COUNT(*) FILTER (WHERE status = 'active') AS active,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM trips`),
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

  /** Recent cross-domain activity feed for the overview (missions/payments/users/claims). */
  static async getRecentActivity(limit = 12) {
    const r = await pool.query(
      `SELECT * FROM (
         SELECT 'mission' AS kind, m.mission_code AS ref, m.status::text AS detail,
                (m.departure_city || ' → ' || m.arrival_city) AS extra,
                (e.first_name || ' ' || e.last_name) AS who, m.created_at
           FROM missions m LEFT JOIN users e ON m.expediteur_id = e.id
         UNION ALL
         SELECT 'payment', p.payment_code, p.status::text, p.amount::text,
                COALESCE(pe.first_name || ' ' || pe.last_name, pa.first_name || ' ' || pa.last_name), p.created_at
           FROM payments p LEFT JOIN users pe ON p.payee_id = pe.id LEFT JOIN users pa ON p.payer_id = pa.id
          WHERE p.status = 'completed'
         UNION ALL
         SELECT 'user', (u.first_name || ' ' || u.last_name), u.user_type::text, '',
                (u.first_name || ' ' || u.last_name), u.created_at
           FROM users u WHERE u.deleted_at IS NULL
         UNION ALL
         SELECT 'claim', c.claim_code, c.status::text, '',
                (cu.first_name || ' ' || cu.last_name), c.created_at
           FROM claims c LEFT JOIN users cu ON c.claimant_id = cu.id
       ) e ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return r.rows;
  }

  // ---------- Analytics ----------
  /**
   * Revenue / commission / volume time series between two dates (inclusive),
   * bucketed by day|week|month. Merges payments, missions and signups per bucket.
   */
  static async getAnalyticsTimeseries(from: string, to: string, interval: string) {
    const unit = ['day', 'week', 'month'].includes(interval) ? interval : 'day';
    // Upper bound is exclusive next-day so `to` is inclusive of the whole day.
    const bounds = ['($1)::date', '(($2)::date + interval \'1 day\')'];
    const [pay, mis, usr] = await Promise.all([
      pool.query(
        `SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period,
                COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS gross,
                COALESCE(SUM(commission) FILTER (WHERE status = 'completed'), 0) AS commission,
                COUNT(*) FILTER (WHERE status = 'completed') AS payments
           FROM payments WHERE created_at >= ${bounds[0]} AND created_at < ${bounds[1]}
          GROUP BY 1 ORDER BY 1`, [from, to, unit]),
      pool.query(
        `SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period, COUNT(*) AS missions
           FROM missions WHERE created_at >= ${bounds[0]} AND created_at < ${bounds[1]}
          GROUP BY 1 ORDER BY 1`, [from, to, unit]),
      pool.query(
        `SELECT to_char(date_trunc($3, created_at), 'YYYY-MM-DD') AS period, COUNT(*) AS new_users
           FROM users WHERE created_at >= ${bounds[0]} AND created_at < ${bounds[1]}
          GROUP BY 1 ORDER BY 1`, [from, to, unit]),
    ]);
    // Merge the three series by period.
    const map: Record<string, any> = {};
    const put = (rows: any[], f: (m: any, r: any) => void) => rows.forEach((r) => {
      map[r.period] = map[r.period] || { period: r.period, gross: 0, commission: 0, payments: 0, missions: 0, new_users: 0 };
      f(map[r.period], r);
    });
    put(pay.rows, (m, r) => { m.gross = Number(r.gross); m.commission = Number(r.commission); m.payments = Number(r.payments); });
    put(mis.rows, (m, r) => { m.missions = Number(r.missions); });
    put(usr.rows, (m, r) => { m.new_users = Number(r.new_users); });
    const series = Object.values(map).sort((a: any, b: any) => a.period < b.period ? -1 : 1);
    const totals = series.reduce((t: any, s: any) => ({
      gross: t.gross + s.gross, commission: t.commission + s.commission,
      payments: t.payments + s.payments, missions: t.missions + s.missions, new_users: t.new_users + s.new_users,
    }), { gross: 0, commission: 0, payments: 0, missions: 0, new_users: 0 });
    totals.avg_order = totals.payments ? Math.round(totals.gross / totals.payments) : 0;
    return { interval: unit, from, to, series, totals };
  }

  /** Most-used routes (departure → arrival) in a date range. */
  static async getTopRoutes(from: string, to: string, limit = 10) {
    const r = await pool.query(
      `SELECT departure_city, arrival_city, arrival_country,
              COUNT(*) AS missions,
              COALESCE(SUM(offered_price), 0) AS volume
         FROM missions
        WHERE created_at >= ($1)::date AND created_at < (($2)::date + interval '1 day')
        GROUP BY departure_city, arrival_city, arrival_country
        ORDER BY missions DESC, volume DESC LIMIT $3`,
      [from, to, limit]
    );
    return r.rows;
  }

  /** Completed-payment volume broken down by payment method, in a date range. */
  static async getPaymentMethodBreakdown(from: string, to: string) {
    const r = await pool.query(
      `SELECT payment_method::text AS method,
              COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count
         FROM payments
        WHERE status = 'completed'
          AND created_at >= ($1)::date AND created_at < (($2)::date + interval '1 day')
        GROUP BY payment_method ORDER BY amount DESC`,
      [from, to]
    );
    return r.rows;
  }

  /** Top GPs by completed missions / earnings / rating. */
  static async getGpPerformance(limit = 10) {
    const r = await pool.query(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS gp_name, u.average_rating, u.total_reviews,
              COALESCE(gp.total_missions_completed, 0) AS missions_completed,
              COALESCE(gp.total_earnings, 0) AS total_earnings,
              COALESCE(gp.success_rate, 0) AS success_rate
         FROM users u JOIN gp_profiles gp ON gp.user_id = u.id
        WHERE u.deleted_at IS NULL
        ORDER BY missions_completed DESC, total_earnings DESC LIMIT $1`,
      [limit]
    );
    return r.rows;
  }
}
