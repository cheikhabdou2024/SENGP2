import { Response } from 'express';
import { TripService } from '../services/trip.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest, UserType } from '../types';
import logger from '../utils/logger';

export class TripController {
  /**
   * Create new trip
   * POST /api/v1/trips
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      if (req.user.user_type !== UserType.GP) {
        ResponseUtil.forbidden(res, 'Only GPs can create trips');
        return;
      }

      // NOTE: the frontend uploads `flight_ticket_photo` (parsed by multer into
      // req.file). There is no column to persist it yet, so it is accepted but
      // not stored. Add a column + storage when ticket verification is built.
      const trip = await TripService.create(req.body, req.user.id);

      ResponseUtil.created(res, trip, 'Trip created successfully');
    } catch (error: any) {
      logger.error('Trip creation error:', error);
      ResponseUtil.badRequest(res, error.message || 'Trip creation failed');
    }
  }

  /**
   * Get trip by ID
   * GET /api/v1/trips/:id
   */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const trip = await TripService.getById(req.params.id);

      if (!trip) {
        ResponseUtil.notFound(res, 'Trip not found');
        return;
      }

      ResponseUtil.success(res, trip);
    } catch (error: any) {
      logger.error('Get trip error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get trip');
    }
  }

  /**
   * Get all trips with filters
   * GET /api/v1/trips
   */
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as any;
      const departure_city = req.query.departure_city as string;
      const arrival_city = req.query.arrival_city as string;

      const result = await TripService.getAll({
        page,
        limit,
        status,
        departure_city,
        arrival_city,
      });

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get trips error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get trips');
    }
  }

  /**
   * Get current GP's trips
   * GET /api/v1/trips/my-trips
   */
  static async getMyTrips(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as any;

      const result = await TripService.getAll({
        page,
        limit,
        status,
        gp_id: req.user.id,
      });

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get my trips error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get trips');
    }
  }

  /**
   * Search available trips (published/active with remaining capacity)
   * GET /api/v1/trips/search
   */
  static async search(req: AuthRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const departure_city = req.query.departure_city as string;
      const arrival_city = req.query.arrival_city as string;
      const departure_after = req.query.departure_after as string;

      const result = await TripService.getAll({
        page,
        limit,
        status: 'published' as any,
        departure_city,
        arrival_city,
        departure_after,
        has_capacity: true,
      });

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Search trips error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to search trips');
    }
  }

  /**
   * Update trip
   * PUT /api/v1/trips/:id
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const trip = await TripService.update(req.params.id, req.user.id, req.body);

      ResponseUtil.success(res, trip, 'Trip updated successfully');
    } catch (error: any) {
      logger.error('Update trip error:', error);

      if (error.message === 'Trip not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      if (error.message.includes('your own trips')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Update failed');
    }
  }

  /**
   * Cancel trip
   * DELETE /api/v1/trips/:id
   */
  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const trip = await TripService.cancel(req.params.id, req.user.id);

      ResponseUtil.success(res, trip, 'Trip cancelled successfully');
    } catch (error: any) {
      logger.error('Cancel trip error:', error);

      if (error.message === 'Trip not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      if (error.message.includes('your own trips')) {
        ResponseUtil.forbidden(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Cancel failed');
    }
  }
}
