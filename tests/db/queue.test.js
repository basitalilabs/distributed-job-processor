const { pool, resetDatabase } = require("../helpers/testDb");   // first, always
const { test, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const claimJob = require("../../src/worker/claimJob");
const reapExpiredJobs = require("../../src/worker/reaper");

after(async function () {
  await pool.end();
});

beforeEach(resetDatabase);

// A waiting job due in `secondsFromNow` (negative = in the past)
async function insertWaitingJob(secondsFromNow) {
  const result = await pool.query(
    "INSERT INTO jobs (type, run_at) VALUES ('send_email', now() + make_interval(secs => $1)) RETURNING id",
    [secondsFromNow]
  );
  return result.rows[0].id;
}

// A running job whose lease ends in `leaseSeconds` (negative = already expired)
async function insertRunningJob(attempts, maxAttempts, leaseSeconds, callbackUrl) {
  const result = await pool.query(
    "INSERT INTO jobs (type, status, attempts, max_attempts, locked_by, locked_until, callback_url) " +
    "VALUES ('send_email', 'running', $1, $2, 'worker-a', now() + make_interval(secs => $3), $4) RETURNING id",
    [attempts, maxAttempts, leaseSeconds, callbackUrl]
  );
  return result.rows[0].id;
}

async function getJob(id) {
  const result = await pool.query("SELECT *, locked_until > now() AS lease_live FROM jobs WHERE id = $1", [id]);
  return result.rows[0];
}

// ---------- claimJob ----------

test("claim on an empty queue returns null", async function () {
  assert.equal(await claimJob("worker-a"), null);
});

test("claim takes a due job and marks it running with a live lease", async function () {
  const id = await insertWaitingJob(-1);

  const job = await claimJob("worker-a");

  assert.equal(job.id, id);
  assert.equal(job.status, "running");
  assert.equal(job.attempts, 1);
  assert.equal(job.locked_by, "worker-a");
  assert.equal((await getJob(id)).lease_live, true);
});

test("claim skips a job scheduled for the future", async function () {
  await insertWaitingJob(3600);
  assert.equal(await claimJob("worker-a"), null);
});

test("claim takes the oldest due job first", async function () {
  const newer = await insertWaitingJob(-10);
  const older = await insertWaitingJob(-60);

  const job = await claimJob("worker-a");
  assert.equal(job.id, older);
});

test("5 workers claiming at the same moment get 5 different jobs", async function () {
  for (let i = 0; i < 5; i++) {
    await insertWaitingJob(-1);
  }

  const claims = [];
  for (let i = 0; i < 5; i++) {
    claims.push(claimJob("worker-" + i));   // start all 5, do not wait yet
  }
  const jobs = await Promise.all(claims);   // now wait for all of them together

  const ids = new Set();
  for (let i = 0; i < jobs.length; i++) {
    assert.notEqual(jobs[i], null, "worker-" + i + " got no job");
    ids.add(jobs[i].id);
  }
  assert.equal(ids.size, 5, "all 5 workers got different jobs");
});

// ---------- reaper ----------

test("reaper requeues an expired job that has attempts left", async function () {
  const id = await insertRunningJob(1, 3, -5, null);

  const result = await reapExpiredJobs();

  const saved = await getJob(id);
  assert.deepEqual(result, { failed: 0, requeued: 1 });
  assert.equal(saved.status, "waiting");
  assert.equal(saved.locked_by, null);
});

test("reaper leaves a job with a live lease alone", async function () {
  const id = await insertRunningJob(1, 3, 30, null);

  const result = await reapExpiredJobs();

  assert.deepEqual(result, { failed: 0, requeued: 0 });
  assert.equal((await getJob(id)).status, "running");
});

test("reaper fails an expired job with no attempts left", async function () {
  const id = await insertRunningJob(3, 3, -5, null);

  const result = await reapExpiredJobs();

  assert.deepEqual(result, { failed: 1, requeued: 0 });
  assert.equal((await getJob(id)).status, "failed");
});

test("reaper failing a job with a callback creates a webhook job", async function () {
  const id = await insertRunningJob(3, 3, -5, "https://example.com/hook");

  await reapExpiredJobs();

  const webhooks = await pool.query("SELECT * FROM jobs WHERE type = 'deliver_webhook'");
  assert.equal(webhooks.rows.length, 1);
  assert.equal(webhooks.rows[0].payload.status, "failed");
  assert.equal(webhooks.rows[0].payload.jobId, id);
});