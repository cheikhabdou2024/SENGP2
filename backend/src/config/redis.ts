import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    // Fail fast instead of hanging startup when Redis is unreachable (cache is optional).
    connectTimeout: 5000,
    reconnectStrategy: false,
  },
  password: process.env.REDIS_PASSWORD || undefined,
  database: parseInt(process.env.REDIS_DB || '0'),
});

redisClient.on('error', (err) => {
  // Don't log errors, handled in server.ts
});

redisClient.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

export const connectRedis = async () => {
  await redisClient.connect();
};

export default redisClient;
