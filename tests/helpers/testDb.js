// Must run BEFORE anything creates the pool, so the app connects to the test DB
const TEST_URL = process.env.TEST_DATABASE_URL;

if (!TEST_URL) {
  throw new Error("TEST_DATABASE_URL is not set. Add it to .env");
}

// Safety lock: these tests wipe tables, so refuse anything not named *_test
const databaseName = new URL(TEST_URL).pathname;
if (!databaseName.endsWith("_test")) {
  throw new Error("Refusing to run: " + databaseName + " is not a test database");
}

process.env.DATABASE_URL = TEST_URL;

const pool = require("../../src/db/pool");

async function resetDatabase() {
  await pool.query("TRUNCATE jobs RESTART IDENTITY CASCADE");
}

module.exports = { pool, resetDatabase };