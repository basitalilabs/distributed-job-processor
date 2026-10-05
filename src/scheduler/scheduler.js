const pool = require("../db/pool");
const cron = require("./cron");
const sleep = require("../utils/sleep");

const IDLE_SLEEP_MS = 1000;

// Handles one due schedule. Returns true if it created a job, false if nothing was due.
async function runDueSchedule() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Pick one due schedule and lock it
    const result = await client.query(
      "SELECT *, now() AS database_now FROM schedules " +
      "WHERE enabled = true AND next_run_at <= now() " +
      "ORDER BY next_run_at " +
      "LIMIT 1 " +
      "FOR UPDATE SKIP LOCKED"
    );

    if (result.rows.length === 0) {
      await client.query("COMMIT");
      return false;
    }

    const schedule = result.rows[0];

    // 2. Next run time, counted from NOW (no catch-up of missed runs)
    const nextRunAt = cron.getNextRunTime(schedule.cron_expression, schedule.database_now);

    // 3. Create the job
    await client.query(
      "INSERT INTO jobs (type, payload) VALUES ($1, $2)",
      [schedule.job_type, schedule.payload]
    );

    // 4. Move the schedule forward
    await client.query(
      "UPDATE schedules " +
      "SET next_run_at = $2, last_run_at = now(), updated_at = now() " +
      "WHERE id = $1",
      [schedule.id, nextRunAt]
    );

    await client.query("COMMIT");
    console.log("Schedule '" + schedule.name + "' created a " + schedule.job_type + " job, next run " + nextRunAt.toISOString());
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function runScheduler() {
  console.log("Scheduler started");

  while (true) {
    try {
      const createdJob = await runDueSchedule();

      if (!createdJob) {
        await sleep(IDLE_SLEEP_MS);
      }
    } catch (error) {
      console.error("Scheduler error:", error.message || error.code);
      await sleep(IDLE_SLEEP_MS);
    }
  }
}

runScheduler();