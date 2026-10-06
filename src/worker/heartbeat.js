const pool = require("../db/pool");
const leaseConfig = require("./leaseConfig");

// Push locked_until forward. Returns false if this worker no longer owns the job.
async function extendLease(jobId, workerId) {
  const result = await pool.query(
    "UPDATE jobs " +
    "SET locked_until = now() + make_interval(secs => $3) " +
    "WHERE id = $1 AND locked_by = $2 AND status = 'running'",
    [jobId, workerId, leaseConfig.LEASE_SECONDS]
  );
  return result.rowCount > 0;
}

// Start extending the lease on a timer. Returns the timer so it can be stopped.
function startHeartbeat(jobId, workerId) {
  const timer = setInterval(async function sendHeartbeat() {
    try {
      const stillOwned = await extendLease(jobId, workerId);
      if (!stillOwned) {
        console.log("Job " + jobId + ": lease lost, another worker may have taken it");
      }
    } catch (error) {
      console.error("Heartbeat failed for job " + jobId + ":", error.message || error.code);
    }
  }, leaseConfig.HEARTBEAT_INTERVAL_MS);

  return timer;
}

function stopHeartbeat(timer) {
  clearInterval(timer);
}

module.exports = {
  startHeartbeat: startHeartbeat,
  stopHeartbeat: stopHeartbeat
};