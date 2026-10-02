const pool = require("../db/pool");

const LEASE_SECONDS = 30;

async function claimJob(workerId) {
  const result = await pool.query(
    "UPDATE jobs " +
    "SET status = 'running', " +
    "    attempts = attempts + 1, " +
    "    locked_by = $1, " +
    "    locked_until = now() + make_interval(secs => $2), " +
    "    updated_at = now() " +
    "WHERE id = ( " +
    "  SELECT id FROM jobs " +
    "  WHERE status = 'waiting' AND run_at <= now() " +
    "  ORDER BY run_at, id " +
    "  LIMIT 1 " +
    "  FOR UPDATE SKIP LOCKED " +
    ") " +
    "RETURNING *",
    [workerId, LEASE_SECONDS]
  );

  if (result.rows.length === 0) {
    return null;            
  }

  return result.rows[0];
}

module.exports = claimJob;