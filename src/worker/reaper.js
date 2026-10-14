const pool = require("../db/pool");
const finishJob = require("./finishJob");

async function reapExpiredJobs() {
  // 1. Lease expired, no attempts left: fail it AND queue its webhook in one statement (decision 010)
  const failedResult = await pool.query(
    "WITH failed AS ( " +
    "  UPDATE jobs " +
    "  SET status = 'failed', " +
    "      last_error = 'Worker stopped responding (lease expired), no attempts left', " +
    "      locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "  WHERE status = 'running' AND locked_until < now() AND attempts >= max_attempts " +
    "  RETURNING id, type, callback_url " +
    "), webhooks AS ( " +
    "  INSERT INTO jobs (type, payload, max_attempts) " +
    "  SELECT 'deliver_webhook', " +
    "         jsonb_build_object('url', callback_url, 'jobId', id::text, 'type', type, 'status', 'failed'), " +
    "         $1 " +
    "  FROM failed " +
    "  WHERE callback_url IS NOT NULL " +
    ") " +
    "SELECT count(*)::int AS total FROM failed",
    [finishJob.WEBHOOK_MAX_ATTEMPTS]
  );

  // 2. Lease expired and attempts left: back to the queue (unchanged)
  const requeuedResult = await pool.query(
    "UPDATE jobs " +
    "SET status = 'waiting', " +
    "    last_error = 'Worker stopped responding (lease expired)', " +
    "    locked_by = NULL, locked_until = NULL, updated_at = now() " +
    "WHERE status = 'running' AND locked_until < now() AND attempts < max_attempts " +
    "RETURNING id"
  );

  return {
    failed: failedResult.rows[0].total,
    requeued: requeuedResult.rows.length
  };
}

module.exports = reapExpiredJobs;