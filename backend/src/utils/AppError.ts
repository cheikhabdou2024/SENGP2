/**
 * An error the client should see as-is, with the HTTP status that fits it.
 * Anything else that is thrown is treated as an unexpected failure.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }

  static badRequest(message: string): AppError { return new AppError(400, message); }
  static forbidden(message: string): AppError { return new AppError(403, message); }
  static notFound(message: string): AppError { return new AppError(404, message); }
  static conflict(message: string): AppError { return new AppError(409, message); }
}
