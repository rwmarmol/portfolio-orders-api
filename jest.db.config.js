/**
 * Database-backed functional tests. They run only against a throwaway `portfolio_test` database
 * created inside the local docker-compose Postgres (see test/db/global-setup.js).
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.db-spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testEnvironment: 'node',
  globalSetup: '<rootDir>/test/db/global-setup.js',
  globalTeardown: '<rootDir>/test/db/global-teardown.js',
  testTimeout: 30_000,
};
