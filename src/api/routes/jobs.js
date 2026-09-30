const express = require("express");
const pool = require("../../db/pool");
const validateCreateJob = require("../validateJob");
const toApiJob = require("../toApiJob");

const router = express.Router();

const DEFAULT_MAX_ATTEMPTS = 5;

router.post("/", async function createJob(req, res, next) {
  // 1. Validate
  const errors = validateCreateJob(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ errors: errors });
  }

  // 2. Pick values, with defaults for optional fields
  const type = req.body.type;
  const payload = req.body.payload !== undefined ? req.body.payload : {};
  const runAt = req.body.runAt !== undefined ? req.body.runAt : null;
  const maxAttempts = req.body.maxAttempts !== undefined ? req.body.maxAttempts : DEFAULT_MAX_ATTEMPTS;

  // 3. Save
  try {
    const result = await pool.query(
      "INSERT INTO jobs (type, payload, run_at, max_attempts) " +
      "VALUES ($1, $2, COALESCE($3::timestamptz, now()), $4) " +
      "RETURNING *",
      [type, payload, runAt, maxAttempts]
    );

    // 4. Respond
    return res.status(201).json(toApiJob(result.rows[0]));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;