import app from './app';
import pool, { testConnection } from './config/database';
import { connectRedis } from './config/redis';
import { migrate } from './config/migrate';
import logger from './utils/logger';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT || '5000', 10);

let httpServer: import('http').Server | undefined;

/**
 * Start the server
 */
async function startServer() {
  try {
    logger.info('Starting server initialization...');

    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connection verified');

    // Initialize database tables (auto-create if not exist)
    logger.info('Initializing database schema...');
    await migrate();
    logger.info('Database initialization complete');

    // Connect to Redis (optional — only attempt if explicitly configured)
    if (process.env.REDIS_HOST) {
      logger.info('Connecting to Redis...');
      await connectRedis().catch(err => {
        logger.warn('Redis connection failed (optional):', err.message);
        logger.info('App will continue without Redis cache');
      });
    } else {
      logger.info('REDIS_HOST not set — running without Redis cache');
    }

    // Create logs directory if it doesn't exist
    if (!fs.existsSync('./logs')) {
      fs.mkdirSync('./logs');
    }

    // Start HTTP server
    logger.info(`Starting HTTP server on 0.0.0.0:${PORT}...`);
    httpServer = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Server is running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Base URL: http://0.0.0.0:${PORT}/api/${process.env.API_VERSION || 'v1'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown: stop accepting connections, let in-flight requests finish
// (money-moving requests included), close the pool, then exit. Forced after 10s.
function shutdown(signal: string) {
  logger.info(`${signal} received: shutting down`);
  const force = setTimeout(() => {
    logger.warn('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 10000);
  force.unref();

  const closePool = () => pool.end().catch(() => undefined).finally(() => process.exit(0));
  if (httpServer) {
    httpServer.close(() => closePool());
  } else {
    closePool();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start the server
startServer();
