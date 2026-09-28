const pg = require('pg');

if(!process.env.DATABASE_URL){
    throw new Error(
        "DATABASE_URL is not set. Run with --env-file=.env or define it in your environment."
    )
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,       
    connectionTimeoutMillis: 5000,  
    application_name: "distributed-job-processor"
})

pool.on("error", function handleIdleClientError(error) {
  console.error("Unexpected error on idle database connection:", error.message || error.code);
});

module.exports = pool;