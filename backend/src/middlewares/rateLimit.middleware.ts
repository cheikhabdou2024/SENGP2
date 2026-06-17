import rateLimit from 'express-rate-limit';

export class RateLimitMiddleware {
  /**
   * General API rate limiter
   * 100 requests per 15 minutes
   */
  static general = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: {
      success: false,
      error: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  /**
   * Auth rate limiter (brute-force protection).
   * Only FAILED attempts count (skipSuccessfulRequests), so a correct login never
   * locks the user out. Default 20 failed attempts per 15 minutes (configurable).
   */
  static auth = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '20'),
    skipSuccessfulRequests: true,
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  /**
   * Public tracking limiter (recipient pages, read-only).
   * Generous because mobile users often share a carrier NAT IP and the pages
   * auto-refresh. 300 requests / 5 minutes by default.
   */
  static publicTracking = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_PUBLIC_WINDOW_MS || '300000'),
    max: parseInt(process.env.RATE_LIMIT_PUBLIC_MAX || '300'),
    message: {
      success: false,
      error: 'Too many requests, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  /**
   * File upload rate limiter
   * 10 requests per hour
   */
  static upload = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: {
      success: false,
      error: 'Too many upload attempts, please try again later',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
