import { body } from 'express-validator';

export const createMissionValidator = [
  body('departure_country').trim().notEmpty().withMessage('Departure country is required'),
  body('departure_city').trim().notEmpty().withMessage('Departure city is required'),
  body('pickup_address').trim().notEmpty().withMessage('Pickup address is required'),
  body('arrival_country').trim().notEmpty().withMessage('Arrival country is required'),
  body('arrival_city').trim().notEmpty().withMessage('Arrival city is required'),
  body('delivery_address').trim().notEmpty().withMessage('Delivery address is required'),
  body('package_weight')
    .isFloat({ min: 0.1 })
    .withMessage('Package weight must be greater than 0'),
  body('package_description').optional().trim(),
  body('package_value').optional().isFloat({ min: 0 }),
  body('desired_departure_date').isISO8601().withMessage('Invalid departure date'),
  body('desired_arrival_date').optional().isISO8601().withMessage('Invalid arrival date'),
  body('offered_price')
    .isFloat({ min: 0 })
    .withMessage('Offered price must be greater than 0'),
  body('is_price_negotiable').optional().isBoolean(),
  body('is_insured').optional().isBoolean(),
  body('recipient_name').optional().trim(),
  body('recipient_phone').optional().trim(),
  // How the sender chose to pay ('cod' = cash on delivery, no online payment).
  body('payment_method').optional({ nullable: true }).isIn(['cod', 'wave', 'orange_money', 'card']).withMessage('Unsupported payment method'),
];

export const updateStatusValidator = [
  body('status')
    .isIn([
      'pending',
      'matched',
      'accepted',
      'picked_up',
      'in_transit',
      'in_customs',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'disputed',
    ])
    .withMessage('Invalid status'),
];
