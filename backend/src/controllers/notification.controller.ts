import { Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { ResponseUtil } from '../utils/response';
import { AuthRequest } from '../types';
import logger from '../utils/logger';

export class NotificationController {
  /**
   * Get current user's notifications
   * GET /api/v1/notifications  and  GET /api/v1/notifications/my-notifications
   */
  static async getMyNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const unreadOnly = req.query.unread === 'true';

      const result = await NotificationService.getByUser(req.user.id, {
        page,
        limit,
        unreadOnly,
      });

      ResponseUtil.success(res, result.data, undefined, result.pagination);
    } catch (error: any) {
      logger.error('Get notifications error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get notifications');
    }
  }

  /**
   * Get unread count
   * GET /api/v1/notifications/unread-count
   */
  static async getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const count = await NotificationService.getUnreadCount(req.user.id);

      ResponseUtil.success(res, { count });
    } catch (error: any) {
      logger.error('Get unread count error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to get unread count');
    }
  }

  /**
   * Create a notification (admin)
   * POST /api/v1/notifications
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      const notification = await NotificationService.create(req.body);

      ResponseUtil.created(res, notification, 'Notification created successfully');
    } catch (error: any) {
      logger.error('Create notification error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to create notification');
    }
  }

  /**
   * Mark a notification as read
   * PUT /api/v1/notifications/:id/read
   */
  static async markAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const notification = await NotificationService.markAsRead(req.params.id, req.user.id);

      ResponseUtil.success(res, notification, 'Notification marked as read');
    } catch (error: any) {
      logger.error('Mark as read error:', error);

      if (error.message === 'Notification not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Failed to mark as read');
    }
  }

  /**
   * Mark all notifications as read
   * PUT /api/v1/notifications/mark-all-read
   */
  static async markAllAsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      const updated = await NotificationService.markAllAsRead(req.user.id);

      ResponseUtil.success(res, { updated }, 'All notifications marked as read');
    } catch (error: any) {
      logger.error('Mark all as read error:', error);
      ResponseUtil.badRequest(res, error.message || 'Failed to mark all as read');
    }
  }

  /**
   * Delete a notification
   * DELETE /api/v1/notifications/:id
   */
  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        ResponseUtil.unauthorized(res);
        return;
      }

      await NotificationService.delete(req.params.id, req.user.id);

      ResponseUtil.success(res, null, 'Notification deleted');
    } catch (error: any) {
      logger.error('Delete notification error:', error);

      if (error.message === 'Notification not found') {
        ResponseUtil.notFound(res, error.message);
        return;
      }

      ResponseUtil.badRequest(res, error.message || 'Failed to delete notification');
    }
  }
}
