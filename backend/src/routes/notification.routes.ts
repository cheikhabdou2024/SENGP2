import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { AuthMiddleware } from '../middlewares/auth.middleware';
import { ValidationMiddleware } from '../middlewares/validation.middleware';
import { UserType } from '../types';
import { createNotificationValidator } from '../validators/notification.validator';

const router = Router();

// All notification routes require authentication
router.use(AuthMiddleware.verifyToken);

// Current user's notifications
router.get('/my-notifications', NotificationController.getMyNotifications);
router.get('/unread-count', NotificationController.getUnreadCount);
router.get('/', NotificationController.getMyNotifications);

// Mark all as read (frontend uses /mark-all-read; /read-all kept as an alias)
router.put('/mark-all-read', NotificationController.markAllAsRead);
router.put('/read-all', NotificationController.markAllAsRead);

// Mark a single notification as read
router.put('/:id/read', NotificationController.markAsRead);

// Delete a notification
router.delete('/:id', NotificationController.delete);

// Create a notification (admin only)
router.post(
  '/',
  AuthMiddleware.requireRole(UserType.ADMIN),
  ValidationMiddleware.validate(createNotificationValidator),
  NotificationController.create
);

export default router;
