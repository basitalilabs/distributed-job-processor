const { pool, resetDatabase } = require("../helpers/testDb");   // first, always
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../../src/api/app");

let server;
let baseUrl;

// Start the API once, on a random free port
before(function () {
  return new Promise(function (resolve) {
    server = app.listen(0, function () {
      baseUrl = "http://localhost:" + server.address().port;
      resolve();
    });
  });
});

after(async function () {
  server.closeAllConnections();   // drop fetch's kept-alive connection now
  server.close();
  await pool.end();
});

// Every test starts with an empty jobs table
beforeEach(resetDatabase);

async function postJob(body) {
  const response = await fetch(baseUrl + "/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json() };
}

async function countJobs() {
  const result = await pool.query("SELECT count(*)::int AS total FROM jobs");
  return result.rows[0].total;
}

test("POST /jobs with a valid body creates a waiting job", async function () {
  const result = await postJob({ type: "send_email", payload: { to: "a@b.com" } });

  assert.equal(result.status, 201);
  assert.equal(result.body.status, "waiting");
  assert.equal(result.body.attempts, 0);
  assert.equal(await countJobs(), 1);
});

test("POST /jobs with a bad body returns 400 and saves nothing", async function () {
  const result = await postJob({ payload: {} });

  assert.equal(result.status, 400);
  assert.ok(result.body.errors.includes("type is required and must be a non-empty string"));
  assert.equal(await countJobs(), 0);
});

test("POST /jobs stores the callbackUrl", async function () {
  const result = await postJob({ type: "send_email", callbackUrl: "https://example.com/hook" });
  const row = await pool.query("SELECT callback_url FROM jobs WHERE id = $1", [result.body.id]);

  assert.equal(row.rows[0].callback_url, "https://example.com/hook");
});

test("GET /jobs/:id returns the job that was created", async function () {
  const created = await postJob({ type: "send_email" });
  const response = await fetch(baseUrl + "/jobs/" + created.body.id);
  const job = await response.json();

  assert.equal(response.status, 200);
  assert.equal(job.id, created.body.id);
  assert.equal(job.type, "send_email");
});

test("GET /jobs/:id for a job that does not exist returns 404", async function () {
  const response = await fetch(baseUrl + "/jobs/999999");
  assert.equal(response.status, 404);
});