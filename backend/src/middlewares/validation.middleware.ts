import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ResponseUtil } from '../utils/response';
import { tr } from '../i18n';

export class ValidationMiddleware {
  /**
   * Validate request and return errors if any
   */
  static validate(validations: ValidationChain[]) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Run all validations
      await Promise.all(validations.map((validation) => validation.run(req)));

      const errors = validationResult(req);
      if (errors.isEmpty()) {
        next();
        return;
      }

      const extractedErrors = errors.array().map((err: any) => ({
        field: err.param,
        message: tr(String(err.msg)),
        value: err.value,
      }));

      ResponseUtil.badRequest(res, 'Validation failed', extractedErrors);
    };
  }
}
