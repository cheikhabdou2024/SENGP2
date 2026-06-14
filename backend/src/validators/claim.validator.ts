import { body } from 'express-validator';

/**
 * Validate claim creation.
 *
 * The two frontend pages send slightly different payloads:
 *  - reclamation.html (expediteur): { mission_id, claim_type, description }
 *  - reclamationgp.html (GP):       { mission_code, claim_type, description }
 *
 * We require a description and a mission reference (either form). `claim_type`
 * is optional here because the frontend sends values that don't all map to the
 * DB enum; the service normalizes them (see ClaimService.normalizeClaimType).
 */
export const createClaimValidator = [
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('claim_type').optional().trim(),
  body('title').optional().trim(),
  body().custom((_value, { req }) => {
    if (!req.body.mission_id && !req.body.mission_code) {
      throw new Error('mission_id or mission_code is required');
    }
    return true;
  }),
];

export const updateClaimValidator = [
  body('status')
    .optional()
    .isIn(['open', 'in_progress', 'resolved', 'rejected', 'closed'])
    .withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  body('description').optional().trim().notEmpty().withMessage('Description cannot be empty'),
];

export const resolveClaimValidator = [
  body('resolution').trim().notEmpty().withMessage('Resolution is required'),
  body('status')
    .optional()
    .isIn(['resolved', 'rejected', 'closed'])
    .withMessage('Invalid resolution status'),
  body('compensation_amount').optional().isFloat({ min: 0 }),
];
