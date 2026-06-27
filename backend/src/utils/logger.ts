import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'sengp-api' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Always log to the console so hosting platforms (App Runner / CloudWatch, etc.)
// capture application logs. JSON in production, pretty output in development.
logger.add(
  new winston.transports.Console({
    format:
      process.env.NODE_ENV === 'production'
        ? winston.format.json()
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ timestamp, level, message, ...rest }) => {
              return `${timestamp} [${level}]: ${message} ${
                Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''
              }`;
            })
          ),
  })
);

export default logger;
