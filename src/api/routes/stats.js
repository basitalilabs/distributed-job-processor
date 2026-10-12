const express = require("express");
const pool = require("../../db/pool");

const router = express.Router();

const STATUS_SQL =
  "SELECT status, count(*)::int AS count FROM jobs GROUP BY status";

const LAG_SQL =
  "SELECT EXTRACT(EPOCH FROM now() - min(run_at))::int AS seconds " +
  "FROM jobs WHERE status = 'waiting' AND run_at <= now()";

const FAILED_LAST_HOUR_SQL =
  "SELECT count(*)::int AS count FROM jobs " +
  "WHERE status = 'failed' AND updated_at > now() - interval '1 hour'";

const WORKERS_SQL =
  "SELECT locked_by, count(*)::int AS count FROM jobs " +
  "WHERE status = 'running' GROUP BY locked_by ORDER BY locked_by";

const RECENT_FAILURES_SQL =
  "SELECT id, type, attempts, last_error, updated_at FROM jobs " +
  "WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10";

router.get("/", async function getStats(req, res, next) {
  try {
    // The five queries are independent, so run them at the same time
    const results = await Promise.all([
      pool.query(STATUS_SQL),
      pool.query(LAG_SQL),
      pool.query(FAILED_LAST_HOUR_SQL),
      pool.query(WORKERS_SQL),
      pool.query(RECENT_FAILURES_SQL)
    ]);

    const statusRows = results[0].rows;
    const lagRow = results[1].rows[0];
    const failedLastHourRow = results[2].rows[0];
    const workerRows = results[3].rows;
    const failureRows = results[4].rows;

    // Start every status at 0, so a status with no jobs still shows
    const counts = { waiting: 0, running: 0, done: 0, failed: 0 };
    for (let i = 0; i < statusRows.length; i++) {
      counts[statusRows[i].status] = statusRows[i].count;
    }

    const workers = [];
    for (let i = 0; i < workerRows.length; i++) {
      workers.push({ workerId: workerRows[i].locked_by, running: workerRows[i].count });
    }

    const recentFailures = [];
    for (let i = 0; i < failureRows.length; i++) {
      recentFailures.push({
        id: failureRows[i].id,
        type: failureRows[i].type,
        attempts: failureRows[i].attempts,
        lastError: failureRows[i].last_error,
        failedAt: failureRows[i].updated_at
      });
    }

    return res.status(200).json({
      counts: counts,
      queueLagSeconds: lagRow.seconds,          // null when nothing is waiting
      failedLastHour: failedLastHourRow.count,
      workers: workers,
      recentFailures: recentFailures
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;