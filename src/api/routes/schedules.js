const express = require("express");
const pool = require("../../db/pool");
const cron = require("../../scheduler/cron");
const validateCreateSchedule = require("../validateSchedule");
const toApiSchedule = require("../toApiSchedule");

const router = express.Router();

router.post("/", async function createSchedule(req, res, next) {
  const errors = validateCreateSchedule(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors: errors });
  }

  const payload = req.body.payload !== undefined ? req.body.payload : {};
  const enabled = req.body.enabled !== undefined ? req.body.enabled : true;

  try {
    // Ask the database what time it is, so next_run_at uses the database clock
    const nowResult = await pool.query("SELECT now() AS now");
    const databaseNow = nowResult.rows[0].now;

    const nextRunAt = cron.getNextRunTime(req.body.cron, databaseNow);

    const result = await pool.query(
      "INSERT INTO schedules (name, cron_expression, job_type, payload, enabled, next_run_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6) " +
      "RETURNING *",
      [req.body.name, req.body.cron, req.body.jobType, payload, enabled, nextRunAt]
    );

    return res.status(201).json(toApiSchedule(result.rows[0]));
  } catch (error) {
    // 23505 is PostgreSQL's code for "unique constraint violated"
    if (error.code === "23505") {
      return res.status(409).json({ error: "A schedule with this name already exists" });
    }
    return next(error);
  }
});

router.get("/", async function listSchedules(req, res, next) {
  try {
    const result = await pool.query("SELECT * FROM schedules ORDER BY id ASC");

    const schedules = [];
    for (let i = 0; i < result.rows.length; i++) {
      schedules.push(toApiSchedule(result.rows[i]));
    }

    return res.status(200).json(schedules);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;