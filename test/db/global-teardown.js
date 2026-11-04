const pg = require('pg');

module.exports = async function globalTeardown() {
  const adminUrl = process.env.TEST_ADMIN_DATABASE_URL;
  if (!adminUrl) return;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query('DROP DATABASE IF EXISTS portfolio_test WITH (FORCE)');
  } finally {
    await admin.end();
  }
};
