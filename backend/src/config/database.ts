import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let poolConfig: PoolConfig;

// Check for AWS Elastic Beanstalk RDS environment variables first
if (process.env.RDS_HOSTNAME) {
  poolConfig = {
    host: process.env.RDS_HOSTNAME,
    port: parseInt(process.env.RDS_PORT || '5432'),
    database: process.env.RDS_DB_NAME || 'ebdb',
    user: process.env.RDS_USERNAME,
    password: process.env.RDS_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false
    }
  };
} else if (process.env.DATABASE_URL) {
  // Use DATABASE_URL if available (production), otherwise use individual variables (development)
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  // Add SSL for production databases only if not explicitly disabled
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('sslmode=disable')) {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }
} else {
  // Development configuration with individual variables
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'sengp_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };
}

const pool = new Pool(poolConfig);

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('Database connected successfully');
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
};

export default pool;
