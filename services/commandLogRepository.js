const { Pool } = require("pg");


// ========================================
// CONNECTION POOL
// ========================================
//
// DATABASE_URL example (Neon):
// postgres://user:password@host/dbname?sslmode=require
//
// ========================================

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "❌ DATABASE_URL is missing — command logs will not be recorded"
  );
}

const pool = connectionString
  ? new Pool({
      connectionString,
      // Neon/most managed Postgres require SSL. sslmode=require in the
      // connection string handles this, but we set ssl explicitly too
      // in case the string omits it.
      ssl: { rejectUnauthorized: false },
    })
  : null;


// ========================================
// ENSURE TABLE EXISTS
// ========================================
//
// Called once at server startup. Safe to run every boot
// (CREATE TABLE IF NOT EXISTS).
//
// ========================================

async function ensureCommandLogsTable() {

  if (!pool) {
    return;
  }

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS command_logs (
      id BIGSERIAL PRIMARY KEY,
      machine_id TEXT NOT NULL,
      event_type TEXT NOT NULL,        -- 'command_sent' | 'command_ack'
      command TEXT NOT NULL,
      requested_by TEXT,
      success BOOLEAN,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  const createIndexSql = `
    CREATE INDEX IF NOT EXISTS idx_command_logs_machine_time
    ON command_logs (machine_id, created_at DESC);
  `;

  try {

    await pool.query(createTableSql);
    await pool.query(createIndexSql);

    console.log("🗄️  command_logs table ready");

  } catch (error) {

    console.error(
      "❌ Failed to initialize command_logs table:",
      error.message
    );
  }
}


// ========================================
// LOG: COMMAND SENT (server → machine)
// ========================================

async function logCommandSent(machineId, command, requestedBy) {

  if (!pool) {
    return null;
  }

  try {

    const result = await pool.query(
      `INSERT INTO command_logs
        (machine_id, event_type, command, requested_by)
       VALUES ($1, 'command_sent', $2, $3)
       RETURNING id, created_at`,
      [machineId, command, requestedBy || null]
    );

    return result.rows[0] || null;

  } catch (error) {

    console.error(
      `⚠️ Failed to log command_sent [${machineId}]:`,
      error.message
    );

    return null;
  }
}


// ========================================
// LOG: COMMAND ACK (machine → server)
// ========================================

async function logCommandAck(machineId, command, success, error) {

  if (!pool) {
    return null;
  }

  try {

    const result = await pool.query(
      `INSERT INTO command_logs
        (machine_id, event_type, command, success, error)
       VALUES ($1, 'command_ack', $2, $3, $4)
       RETURNING id, created_at`,
      [machineId, command || null, success ?? null, error || null]
    );

    return result.rows[0] || null;

  } catch (dbError) {

    console.error(
      `⚠️ Failed to log command_ack [${machineId}]:`,
      dbError.message
    );

    return null;
  }
}


// ========================================
// GET LOGS FOR A MACHINE (defaults to today)
// ========================================

async function getMachineLogs(machineId, { date } = {}) {

  if (!pool) {
    return [];
  }

  // Default to "today" in UTC if no date given.
  const targetDate = date || new Date().toISOString().slice(0, 10);

  try {

    const result = await pool.query(
      `SELECT id, machine_id, event_type, command, requested_by,
              success, error, created_at
       FROM command_logs
       WHERE machine_id = $1
         AND created_at >= $2::date
         AND created_at < ($2::date + INTERVAL '1 day')
       ORDER BY created_at DESC`,
      [machineId, targetDate]
    );

    return result.rows;

  } catch (error) {

    console.error(
      `⚠️ Failed to fetch logs [${machineId}]:`,
      error.message
    );

    return [];
  }
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  pool,
  ensureCommandLogsTable,
  logCommandSent,
  logCommandAck,
  getMachineLogs,
};
