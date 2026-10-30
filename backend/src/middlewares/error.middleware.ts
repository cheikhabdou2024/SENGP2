import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from '../utils/response';
import logger from '../utils/logger';

export class ErrorMiddleware {
  /**
   * Global error handler
   */
  static handle(err: any, req: Request, res: Response, _next: NextFunction): void {
    logger.error('Error occurred:', {
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });

    // Database errors
    if (err.code === '23505') {
      // Unique violation
      ResponseUtil.conflict(res, 'Resource already exists');
      return;
    }

    if (err.code === '23503') {
      // Foreign key violation
      ResponseUtil.badRequest(res, 'Invalid reference');
      return;
    }

    if (err.code === '23502') {
      // Not null violation
      ResponseUtil.badRequest(res, 'Required field missing');
      return;
    }

    // Validation errors
    if (err.name === 'ValidationError') {
      ResponseUtil.badRequest(res, err.message, err.errors);
      return;
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
      ResponseUtil.unauthorized(res, 'Invalid token');
      return;
    }

    if (err.name === 'TokenExpiredError') {
      ResponseUtil.unauthorized(res, 'Token expired');
      return;
    }

    // Multer errors (file upload)
    if (err.name === 'MulterError') {
      if (err.code === 'LIMIT_FILE_SIZE') {
        ResponseUtil.badRequest(res, 'File size too large');
        return;
      }
      ResponseUtil.badRequest(res, err.message);
      return;
    }

    // Default error
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message;

    res.status(statusCode).json({
      success: false,
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  /**
   * 404 Not Found handler
   */
  static notFound(req: Request, res: Response): void {
    ResponseUtil.notFound(res, `Route ${req.originalUrl} not found`);
  }
}
