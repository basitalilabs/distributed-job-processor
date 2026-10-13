const { pool, resetDatabase } = require("../helpers/testDb");   // must be the first require
const { test, after } = require("node:test");
const assert = require("node:assert/strict");

after(async function () {
  await pool.end();   // without this, the open connection keeps Node alive and npm test hangs
});

test("reset empties jobs and restarts ids at 1", async function () {
  await resetDatabase();
  await pool.query("INSERT INTO jobs (type, payload) VALUES ('smoke', '{}')");
  await pool.query("INSERT INTO jobs (type, payload) VALUES ('smoke', '{}')");

  await resetDatabase();
  const inserted = await pool.query("INSERT INTO jobs (type, payload) VALUES ('smoke', '{}') RETURNING id");
  assert.equal(Number(inserted.rows[0].id), 1);
});