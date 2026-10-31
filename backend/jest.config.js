/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tests/tsconfig.json' }] },
};
