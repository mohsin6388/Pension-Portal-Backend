require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

// Neon idle connections tod sakta hai, isliye yahan exit mat karo
pool.on("error", (err) => {
  console.error("❌ Unexpected error on idle client", err.message);
});

module.exports = pool;
