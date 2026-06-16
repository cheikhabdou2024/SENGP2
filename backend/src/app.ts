import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { ErrorMiddleware } from './middlewares/error.middleware';
import { RateLimitMiddleware } from './middlewares/rateLimit.middleware';
import logger from './utils/logger';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import missionRoutes from './routes/mission.routes';
import tripRoutes from './routes/trip.routes';
import paymentRoutes from './routes/payment.routes';
import notificationRoutes from './routes/notification.routes';
import claimRoutes from './routes/claim.routes';
import walletRoutes from './routes/wallet.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import adminRoutes from './routes/admin.routes';

dotenv.config();

const app: Application = express();

// Behind App Runner's proxy: trust the first hop so X-Forwarded-For / rate
// limiting and client IPs are handled correctly.
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet());

// Parse CORS origins (support multiple origins separated by comma)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or if we allow all
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  credentials: true,
}));

// Body Parser Middleware
// Capture the raw body so payment-provider webhooks can verify HMAC signatures.
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression Middleware
app.use(compression());

// Logging Middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }));
}

// Rate Limiting
app.use('/api/', RateLimitMiddleware.general);

// Root Route - API Info
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SEN GP API - Bienvenue sur l\'API de livraison collaborative',
    version: process.env.API_VERSION || 'v1',
    status: 'operational',
    endpoints: {
      health: '/health',
      api: `/api/${process.env.API_VERSION || 'v1'}`,
      auth: {
        register: `/api/${process.env.API_VERSION || 'v1'}/auth/register`,
        login: `/api/${process.env.API_VERSION || 'v1'}/auth/login`,
      },
      resources: {
        missions: `/api/${process.env.API_VERSION || 'v1'}/missions`,
        trips: `/api/${process.env.API_VERSION || 'v1'}/trips`,
        users: `/api/${process.env.API_VERSION || 'v1'}/users`,
        payments: `/api/${process.env.API_VERSION || 'v1'}/payments`,
        notifications: `/api/${process.env.API_VERSION || 'v1'}/notifications`,
        claims: `/api/${process.env.API_VERSION || 'v1'}/claims`,
      },
    },
    documentation: 'https://github.com/sengp/api-docs',
    timestamp: new Date().toISOString(),
  });
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
const apiVersion = process.env.API_VERSION || 'v1';
app.use(`/api/${apiVersion}/auth`, authRoutes);
app.use(`/api/${apiVersion}/users`, userRoutes);
app.use(`/api/${apiVersion}/missions`, missionRoutes);
app.use(`/api/${apiVersion}/trips`, tripRoutes);
app.use(`/api/${apiVersion}/payments`, paymentRoutes);
app.use(`/api/${apiVersion}/notifications`, notificationRoutes);
app.use(`/api/${apiVersion}/claims`, claimRoutes);
app.use(`/api/${apiVersion}/wallet`, walletRoutes);
app.use(`/api/${apiVersion}/withdrawals`, withdrawalRoutes);
app.use(`/api/${apiVersion}/admin`, adminRoutes);

// Serve static frontend files in production
if (process.env.NODE_ENV === 'production') {
  // Serve static files from www directory (frontend build)
  const wwwPath = path.join(__dirname, '../../www');
  app.use(express.static(wwwPath));

  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(wwwPath, 'index.html'));
    } else {
      res.status(404).json({
        success: false,
        message: 'API endpoint not found',
      });
    }
  });
}

// 404 Handler (only for development or non-static routes)
if (process.env.NODE_ENV !== 'production') {
  app.use(ErrorMiddleware.notFound);
}

// Global Error Handler
app.use(ErrorMiddleware.handle);

export default app;
