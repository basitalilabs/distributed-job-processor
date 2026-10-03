const pool = require("../db/pool");

async function markJobDone(jobId, workerId) {
  await pool.query(
    "UPDATE jobs " +
    "SET status = 'done', locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId]
  );
}

async function markJobFailed(jobId, workerId, errorMessage) {
  await pool.query(
    "UPDATE jobs " +
    "SET status = 'failed', last_error = $3, locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId, errorMessage]
  );
}

async function retryJob(jobId, workerId, errorMessage, delaySeconds) {
  await pool.query(
    "UPDATE jobs " +
    "SET status = 'waiting', " +
    "    run_at = now() + make_interval(secs => $4), " +
    "    last_error = $3, locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId, errorMessage, delaySeconds]
  );
}

module.exports = {
  markJobDone: markJobDone,
  markJobFailed: markJobFailed,
  retryJob: retryJob
};