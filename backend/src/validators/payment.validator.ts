import { body } from 'express-validator';

/**
 * Validate payment initiation. The expéditeur pays for a mission via a mobile
 * money provider (Wave or Orange Money). A mission reference is required in either
 * form (mission_id UUID or mission_code); the amount defaults to the mission's
 * offered_price when omitted.
 */
export const createPaymentValidator = [
  body('payment_method')
    .isIn(['wave', 'orange_money'])
    .withMessage('payment_method must be wave or orange_money'),
  body('amount').optional().isFloat({ min: 1 }).withMessage('amount must be a positive number'),
  body().custom((_value, { req }) => {
    if (!req.body.mission_id && !req.body.mission_code) {
      throw new Error('mission_id or mission_code is required');
    }
    return true;
  }),
];
