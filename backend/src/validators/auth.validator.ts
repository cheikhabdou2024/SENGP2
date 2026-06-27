import { body } from 'express-validator';

export const registerValidator = [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('phone').optional({ values: 'falsy' }).trim(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
  body('user_type')
    .isIn(['expediteur', 'gp'])
    .withMessage('User type must be either expediteur or gp'),
  body('first_name').trim().notEmpty().withMessage('First name is required'),
  body('last_name').trim().notEmpty().withMessage('Last name is required'),
];

export const googleAuthValidator = [
  body('id_token').notEmpty().withMessage('Google id_token is required'),
  body('user_type').optional().isIn(['expediteur', 'gp']).withMessage('Invalid user type'),
  body('expected_type').optional().isIn(['expediteur', 'gp']).withMessage('Invalid expected type'),
];

export const loginValidator = [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('expected_type').optional().isIn(['expediteur', 'gp']).withMessage('Invalid expected type'),
];

export const changePasswordValidator = [
  body('oldPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long'),
];

export const forgotPasswordValidator = [
  body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
];
