import { body } from 'express-validator';

/**
 * Validate trip creation.
 *
 * The web frontend (creetrajet.html) sends a multipart/form-data body using the
 * field names `departure_datetime`, `arrival_datetime` and `available_weight`.
 * We validate those wire names here; the service maps them to the DB columns
 * (`departure_date`, `arrival_date`, `available_weight`).
 */
export const createTripValidator = [
  body('departure_country').trim().notEmpty().withMessage('Departure country is required'),
  body('departure_city').trim().notEmpty().withMessage('Departure city is required'),
  body('arrival_country').trim().notEmpty().withMessage('Arrival country is required'),
  body('arrival_city').trim().notEmpty().withMessage('Arrival city is required'),
  body('departure_datetime')
    .isISO8601()
    .withMessage('Invalid departure date'),
  body('arrival_datetime')
    .isISO8601()
    .withMessage('Invalid arrival date')
    .custom((value, { req }) => {
      const departure = req.body.departure_datetime;
      if (departure && new Date(value) <= new Date(departure)) {
        throw new Error('Arrival date must be after departure date');
      }
      return true;
    }),
  body('available_weight')
    .isFloat({ min: 0.1 })
    .withMessage('Available weight must be greater than 0'),
  body('max_packages').optional().isInt({ min: 1 }),
  body('flight_number').optional().trim(),
  body('airline').optional().trim(),
  body('departure_airport_code').optional().trim(),
  body('arrival_airport_code').optional().trim(),
];

export const updateTripStatusValidator = [
  body('status')
    .isIn(['draft', 'published', 'active', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
];
