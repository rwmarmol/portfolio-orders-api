// Applies the SQL files in db/migrations in order and records them in schema_migrations.
// Restricted to local databases: it refuses any other host unless --allow-remote is passed
// explicitly by a human operator.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'db', 'migrations');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
// Arbitrary constant: serializes concurrent runners with a session advisory lock.
const ADVISORY_LOCK_KEY = 727_001;

export function isLocalDatabaseUrl(databaseUrl) {
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
  } catch {
    return false;
  }
}

export function assertAllowedTarget(databaseUrl, allowRemote = false) {
  let host;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  if (!LOCAL_HOSTS.has(host) && !allowRemote) {
    throw new Error(
      `Refusing to migrate non-local host "${host}". ` +
        'Migrations run only against the local docker-compose Postgres.',
    );
  }
}

function pendingFiles(applied) {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{3}-.+\.sql$/.test(name) && !name.endsWith('-precheck.sql'))
    .sort()
    .filter((name) => !applied.has(name.replace(/\.sql$/, '')));
}

/** Applies pending migrations. Throws (after rolling back the failing file) on any error. */
export async function migrate(databaseUrl, { allowRemote = false, log = () => {} } = {}) {
  assertAllowedTarget(databaseUrl, allowRemote);

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query('SELECT version FROM schema_migrations');
    const files = pendingFiles(new Set(rows.map((row) => row.version)));
    if (files.length === 0) {
      log('Nothing to apply.');
      return;
    }
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
        log(`Applied ${version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${version} failed and was rolled back: ${err.message}`, {
          cause: err,
        });
      }
    }
  } finally {
    await client.end();
  }
}

function loadEnv() {
  try {
    process.loadEnvFile();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  await migrate(databaseUrl, {
    allowRemote: process.argv.includes('--allow-remote'),
    log: console.log,
  });
}

// Run only when executed directly (not when imported by the test setup).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
