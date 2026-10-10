const pool = require("../db/pool");
const WEBHOOK_MAX_ATTEMPTS = 10; // decision 010

async function runFinalUpdate(updateSql, params, job, finalStatus) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(updateSql, params);
    const updated = result.rowCount > 0;

    if (updated && job.callback_url !== null) {
      const webhookPayload = {
        url: job.callback_url,
        jobId: job.id,
        type: job.type,
        status: finalStatus
      };
      await client.query(
        "INSERT INTO jobs (type, payload, max_attempts) VALUES ('deliver_webhook', $1, $2)",
        [webhookPayload, WEBHOOK_MAX_ATTEMPTS]
      );
    }

    await client.query("COMMIT");
    return updated;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function markJobDone(job, workerId) {
  return runFinalUpdate(
    "UPDATE jobs " +
    "SET status = 'done', locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [job.id, workerId],
    job,
    "done"
  );
}

async function markJobFailed(job, workerId, errorMessage) {
  return runFinalUpdate(
    "UPDATE jobs " +
    "SET status = 'failed', last_error = $3, locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [job.id, workerId, errorMessage],
    job,
    'failed'
  );
}

async function retryJob(jobId, workerId, errorMessage, delaySeconds) {
  const result = await pool.query(
    "UPDATE jobs " +
    "SET status = 'waiting', " +
    "    run_at = now() + make_interval(secs => $4), " +
    "    last_error = $3, locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId, errorMessage, delaySeconds]
  );
  return result.rowCount > 0;
}

async function releaseJob(jobId, workerId) {
  const result = await pool.query(
    "UPDATE jobs SET " +
      "status = 'waiting', " +
      "attempts = attempts - 1, " +
      "last_error = 'Worker shut down before finishing, job released', " +
      "locked_by = NULL, " +
      "locked_until = NULL, " +
      "updated_at = now() " +
      "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId]
  );
  return result.rowCount > 0;
}

module.exports = {
  markJobDone: markJobDone,
  markJobFailed: markJobFailed,
  retryJob: retryJob,
  releaseJob: releaseJob
};