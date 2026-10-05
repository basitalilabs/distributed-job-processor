const pool = require("../db/pool");

async function reapExpiredJobs() {
  // 1. Lease expired and no attempts left: give up
  const failedResult = await pool.query(
    "UPDATE jobs " +
    "SET status = 'failed', " +
    "    last_error = 'Worker stopped responding (lease expired), no attempts left', " +
    "    locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE status = 'running' AND locked_until < now() AND attempts >= max_attempts " +
    "RETURNING id"
  );

  // 2. Lease expired and attempts left: back to the queue
  const requeuedResult = await pool.query(
    "UPDATE jobs " +
    "SET status = 'waiting', " +
    "    last_error = 'Worker stopped responding (lease expired)', " +
    "    locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE status = 'running' AND locked_until < now() AND attempts < max_attempts " +
    "RETURNING id"
  );

  return {
    failed: failedResult.rows.length,
    requeued: requeuedResult.rows.length
  };
}

module.exports = reapExpiredJobs;