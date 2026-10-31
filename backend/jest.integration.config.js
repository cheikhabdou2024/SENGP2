/**
 * Tests d'intégration : vraie base PostgreSQL (jetable), vraie application Express.
 * Lancement : TEST_DATABASE_URL=postgres://.../sengp_test npm run test:integration
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/tests/integration/env.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tests/tsconfig.json' }] },
  testTimeout: 30000,
  maxWorkers: 1,
};
