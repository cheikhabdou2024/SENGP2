import pool from '../config/database';
import { Trip, TripStatus, PaginatedResult } from '../types';
import { Helpers } from '../utils/helpers';
import logger from '../utils/logger';

export class TripService {
  /**
   * Create a new trip (GP)
   *
   * Accepts both the frontend wire names (`departure_datetime`, `arrival_datetime`)
   * and the canonical column names (`departure_date`, `arrival_date`).
   */
  static async create(data: any, gpId: string): Promise<Trip> {
    const departure_date = data.departure_date || data.departure_datetime;
    const arrival_date = data.arrival_date || data.arrival_datetime;

    const trip_code = Helpers.generateCode('TRJ');

    const result = await pool.query(
      `INSERT INTO trips (
        trip_code, gp_id, departure_country, departure_city, departure_airport_code,
        arrival_country, arrival_city, arrival_airport_code, departure_date, arrival_date,
        flight_number, airline, available_weight, max_packages, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        trip_code,
        gpId,
        data.departure_country,
        data.departure_city,
        data.departure_airport_code || null,
        data.arrival_country,
        data.arrival_city,
        data.arrival_airport_code || null,
        departure_date,
        arrival_date,
        data.flight_number || null,
        data.airline || null,
        data.available_weight,
        data.max_packages || 3,
        TripStatus.PUBLISHED,
      ]
    );

    const trip = result.rows[0];

    logger.info(`Trip created: ${trip.trip_code} by GP ${gpId}`);

    return trip;
  }

  /**
   * Get trip by ID (with GP details)
   */
  static async getById(id: string): Promise<Trip | null> {
    const result = await pool.query(
      `SELECT t.*,
              g.first_name as gp_first_name,
              g.last_name as gp_last_name,
              g.phone as gp_phone,
              g.average_rating as gp_rating
       FROM trips t
       LEFT JOIN users g ON t.gp_id = g.id
       WHERE t.id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get trips with pagination and filters
   */
  static async getAll(params: {
    page: number;
    limit: number;
    status?: TripStatus;
    gp_id?: string;
    departure_city?: string;
    arrival_city?: string;
    departure_after?: string;
    has_capacity?: boolean;
  }): Promise<PaginatedResult<Trip>> {
    const { page, limit, offset } = Helpers.getPaginationParams(params.page, params.limit);

    let whereClause = 'WHERE 1=1';
    const queryParams: any[] = [];
    let paramIndex = 1;

    if (params.status) {
      whereClause += ` AND t.status = $${paramIndex}`;
      queryParams.push(params.status);
      paramIndex++;
    }

    if (params.gp_id) {
      whereClause += ` AND t.gp_id = $${paramIndex}`;
      queryParams.push(params.gp_id);
      paramIndex++;
    }

    if (params.departure_city) {
      whereClause += ` AND t.departure_city ILIKE $${paramIndex}`;
      queryParams.push(`%${params.departure_city}%`);
      paramIndex++;
    }

    if (params.arrival_city) {
      whereClause += ` AND t.arrival_city ILIKE $${paramIndex}`;
      queryParams.push(`%${params.arrival_city}%`);
      paramIndex++;
    }

    if (params.departure_after) {
      whereClause += ` AND t.departure_date >= $${paramIndex}`;
      queryParams.push(params.departure_after);
      paramIndex++;
    }

    if (params.has_capacity) {
      whereClause += ` AND t.current_packages < t.max_packages`;
    }

    const countQuery = `SELECT COUNT(*) FROM trips t ${whereClause}`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT t.*,
             g.first_name || ' ' || g.last_name as gp_name,
             g.phone as gp_phone,
             g.average_rating as gp_rating
      FROM trips t
      LEFT JOIN users g ON t.gp_id = g.id
      ${whereClause}
      ORDER BY t.departure_date ASC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataParams = [...queryParams, limit, offset];
    const result = await pool.query(dataQuery, dataParams);

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
   * Update a trip. Only the owning GP may update it.
   */
  static async update(id: string, gpId: string, data: Partial<Trip>): Promise<Trip> {
    const existing = await pool.query('SELECT gp_id FROM trips WHERE id = $1', [id]);

    if (existing.rows.length === 0) {
      throw new Error('Trip not found');
    }

    if (existing.rows[0].gp_id !== gpId) {
      throw new Error('You can only update your own trips');
    }

    // Whitelist of columns that may be updated
    const allowed = [
      'departure_country',
      'departure_city',
      'departure_airport_code',
      'arrival_country',
      'arrival_city',
      'arrival_airport_code',
      'departure_date',
      'arrival_date',
      'flight_number',
      'airline',
      'available_weight',
      'max_packages',
      'status',
    ];

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined && allowed.includes(key)) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE trips SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    logger.info(`Trip updated: ${id}`);
    return result.rows[0];
  }

  /**
   * Cancel a trip. Only the owning GP may cancel it.
   */
  static async cancel(id: string, gpId: string): Promise<Trip> {
    const existing = await pool.query('SELECT gp_id, status FROM trips WHERE id = $1', [id]);

    if (existing.rows.length === 0) {
      throw new Error('Trip not found');
    }

    if (existing.rows[0].gp_id !== gpId) {
      throw new Error('You can only cancel your own trips');
    }

    if (existing.rows[0].status === TripStatus.COMPLETED) {
      throw new Error('A completed trip cannot be cancelled');
    }

    const result = await pool.query(
      `UPDATE trips SET status = $1 WHERE id = $2 RETURNING *`,
      [TripStatus.CANCELLED, id]
    );

    logger.info(`Trip cancelled: ${id}`);
    return result.rows[0];
  }
}
