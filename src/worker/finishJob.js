const pool = require("../db/pool");

async function markJobDone(jobId, workerId) {
  const result = await pool.query(
    "UPDATE jobs " +
    "SET status = 'done', locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId]
  );

  return result.rowCount > 0;
}

async function markJobFailed(jobId, workerId, errorMessage) {
  const result = await pool.query(
    "UPDATE jobs " +
    "SET status = 'failed', last_error = $3, locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId, errorMessage]
  );
  return result.rowCount > 0;
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

module.exports = {
  markJobDone: markJobDone,
  markJobFailed: markJobFailed,
  retryJob: retryJob
};