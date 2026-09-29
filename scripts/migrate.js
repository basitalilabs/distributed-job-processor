const fs = require("fs");
const path = require("path");
const pool = require("../src/db/pool");

const migrationsFolder = path.join(__dirname, "..", "migrations");

// 1. Create the tracking table if it doesn't exist
async function createMigrationsTable() {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (" +
    "  filename TEXT PRIMARY KEY," +
    "  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()" +
    ")"
  );
}

// 2. Get filenames already applied
async function getAppliedMigrations() {
  const result = await pool.query("SELECT filename FROM schema_migrations");
  const applied = [];
  for (let i = 0; i < result.rows.length; i++) {
    applied.push(result.rows[i].filename);
  }
  return applied;
}

// 3. Get .sql files from the migrations folder, sorted
function getMigrationFiles() {
  const allFiles = fs.readdirSync(migrationsFolder);
  const sqlFiles = [];
  for (let i = 0; i < allFiles.length; i++) {
    if (allFiles[i].endsWith(".sql")) {
      sqlFiles.push(allFiles[i]);
    }
  }
  sqlFiles.sort();
  return sqlFiles;
}

// 4. Apply one migration inside a transaction and record it
async function applyMigration(filename) {
  const sql = fs.readFileSync(path.join(migrationsFolder, filename), "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    await client.query("COMMIT");
    console.log("Applied: " + filename);
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(
      "Migration " + filename + " failed: " + (error.message || error.code)
    );
  } finally {
    client.release();
  }
}

// 5. Apply every migration not yet applied, in order
async function runMigrations() {
  try {
    await createMigrationsTable();
    const applied = await getAppliedMigrations();
    const files = getMigrationFiles();

    let newCount = 0;
    for (let i = 0; i < files.length; i++) {
      if (!applied.includes(files[i])) {
        await applyMigration(files[i]);
        newCount = newCount + 1;
      }
    }

    if (newCount === 0) {
      console.log("Database is already up to date.");
    }
  } catch (error) {
    console.error(error.message || error.code);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigrations();