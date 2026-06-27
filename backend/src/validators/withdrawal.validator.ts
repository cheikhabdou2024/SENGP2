import { body } from 'express-validator';

export const createWithdrawalValidator = [
  body('amount').isFloat({ min: 1 }).withMessage('amount must be a positive number'),
  body('method')
    .isIn(['wave', 'orange_money', 'free_money', 'card', 'bank_transfer'])
    .withMessage('Invalid withdrawal method'),
  body('account_number').trim().notEmpty().withMessage('Account number is required'),
  body('account_name').optional().trim(),
];

export const rejectWithdrawalValidator = [
  body('reason').optional().trim(),
];
