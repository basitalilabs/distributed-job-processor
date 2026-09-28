const pool = require("../src/db/pool.js");

async function checkDatabase() {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log("✅ Database connected successfully!");
    console.log("Database time:", result.rows[0].now);
  } catch (error) {
    console.error(
      "❌ Database connection failed:",
      error.message || error.code || "Unknown database error"
    );

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

checkDatabase();
