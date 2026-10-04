const express = require("express");
const pool = require("../db/pool");
const jobsRouter = require("./routes/jobs");
const schedulesRouter = require("./routes/schedules");
const app = express();

app.use(express.json({ limit: "64kb" }));

// Health check: API is up, and the database answers
app.get("/health", async function healthCheck(req, res) {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", database: "up" });
  } catch (error) {
    console.error("Health check failed:", error.message || error.code);
    res.status(503).json({ status: "error", database: "down" });
  }
});

app.use("/jobs", jobsRouter);
app.use("/schedules", schedulesRouter);
// 404: no route matched
app.use(function handleNotFound(req, res) {
  res.status(404).json({ error: "Not found" });
});

// Error handler: 4 parameters tell Express this handles errors
app.use(function handleError(error, req, res, next) {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ error: "Payload too large" });
  }

  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;