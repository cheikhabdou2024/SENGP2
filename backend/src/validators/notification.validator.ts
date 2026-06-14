import { body } from 'express-validator';

/**
 * Validate admin/system notification creation. The frontend never POSTs
 * notifications (they are created server-side), but this allows an admin to send
 * one, e.g. a system_alert.
 */
export const createNotificationValidator = [
  body('user_id').trim().notEmpty().withMessage('user_id is required'),
  body('notification_type')
    .isIn([
      'mission_matched',
      'mission_accepted',
      'mission_pickup',
      'mission_transit',
      'mission_delivered',
      'payment_received',
      'claim_created',
      'claim_resolved',
      'review_received',
      'account_verified',
      'system_alert',
    ])
    .withMessage('Invalid notification_type'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('action_url').optional().trim(),
];
