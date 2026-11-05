// Recreates the `portfolio_test` database inside the LOCAL docker-compose Postgres and loads the
// same SQL files, in the same order, that the compose entrypoint runs (db/init). Refuses any
// non-local host.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const pg = require('pg');

const TEST_DATABASE = 'portfolio_test';
const COMPOSE_DEFAULT_URL = 'postgresql://portfolio:portfolio@localhost:5433/portfolio';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const INIT_DIR = join(__dirname, '..', '..', 'db', 'init');

function isLocalDatabaseUrl(databaseUrl) {
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

function withDatabase(baseUrl, database) {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

module.exports = async function globalSetup() {
  try {
    process.loadEnvFile();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const baseUrl = process.env.DATABASE_URL ?? COMPOSE_DEFAULT_URL;
  if (!isLocalDatabaseUrl(baseUrl)) {
    throw new Error('Refusing to run database tests: DATABASE_URL does not point to a local host.');
  }
  const adminUrl = withDatabase(baseUrl, 'postgres');
  const testUrl = withDatabase(baseUrl, TEST_DATABASE);

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE}`);
  } finally {
    await admin.end();
  }

  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    const files = readdirSync(INIT_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const file of files) {
      await client.query(readFileSync(join(INIT_DIR, file), 'utf8'));
    }
  } finally {
    await client.end();
  }

  process.env.TEST_DATABASE_URL = testUrl;
  process.env.TEST_ADMIN_DATABASE_URL = adminUrl;
};
