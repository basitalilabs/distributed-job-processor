const { pool, resetDatabase } = require("../helpers/testDb");   // first, always
const { test, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const finishJob = require("../../src/worker/finishJob");

after(async function () {
  await pool.end();
});

beforeEach(resetDatabase);

// Puts a job in the table as if worker-a had claimed it and holds a live lease
async function insertRunningJob(callbackUrl) {
  const result = await pool.query(
    "INSERT INTO jobs (type, payload, status, attempts, locked_by, locked_until, callback_url) " +
    "VALUES ('send_email', '{}', 'running', 2, 'worker-a', now() + interval '30 seconds', $1) RETURNING *",
    [callbackUrl]
  );
  return result.rows[0];
}

async function getJob(id) {
  const result = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
  return result.rows[0];
}

async function getWebhookJobs() {
  const result = await pool.query("SELECT * FROM jobs WHERE type = 'deliver_webhook'");
  return result.rows;
}

test("owner marks done without callback: done, no webhook job", async function () {
  const job = await insertRunningJob(null);

  const updated = await finishJob.markJobDone(job, "worker-a");

  assert.equal(updated, true);
  assert.equal((await getJob(job.id)).status, "done");
  assert.equal((await getWebhookJobs()).length, 0);
});

test("owner marks done with callback: exactly one webhook job", async function () {
  const job = await insertRunningJob("https://example.com/hook");

  await finishJob.markJobDone(job, "worker-a");

  const webhooks = await getWebhookJobs();
  assert.equal(webhooks.length, 1);
  assert.equal(webhooks[0].max_attempts, 10);
  assert.equal(webhooks[0].payload.url, "https://example.com/hook");
  assert.equal(webhooks[0].payload.status, "done");
  assert.equal(webhooks[0].payload.jobId, job.id);
});

test("wrong worker marks done: nothing changes, no webhook job", async function () {
  const job = await insertRunningJob("https://example.com/hook");

  const updated = await finishJob.markJobDone(job, "worker-b");

  assert.equal(updated, false);
  assert.equal((await getJob(job.id)).status, "running");
  assert.equal((await getWebhookJobs()).length, 0);
});

test("owner marks failed: failed, error saved, webhook says failed", async function () {
  const job = await insertRunningJob("https://example.com/hook");

  await finishJob.markJobFailed(job, "worker-a", "SMTP server down");

  const saved = await getJob(job.id);
  assert.equal(saved.status, "failed");
  assert.equal(saved.last_error, "SMTP server down");
  assert.equal((await getWebhookJobs())[0].payload.status, "failed");
});

test("owner releases: waiting again, attempts minus one, lock cleared", async function () {
  const job = await insertRunningJob(null);

  const released = await finishJob.releaseJob(job.id, "worker-a");

  const saved = await getJob(job.id);
  assert.equal(released, true);
  assert.equal(saved.status, "waiting");
  assert.equal(saved.attempts, 1);
  assert.equal(saved.locked_by, null);
  assert.equal(saved.locked_until, null);
});

test("wrong worker releases: nothing changes", async function () {
  const job = await insertRunningJob(null);

  const released = await finishJob.releaseJob(job.id, "worker-b");

  const saved = await getJob(job.id);
  assert.equal(released, false);
  assert.equal(saved.status, "running");
  assert.equal(saved.locked_by, "worker-a");
  assert.notEqual(saved.locked_until, null);
});