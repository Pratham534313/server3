const {
  pool,
} = require("./commandLogRepository");


// ========================================
// ENSURE TABLE EXISTS
// ========================================

async function ensureAuditLogsTable() {

  if (!pool) {
    return;
  }

  const createTableSql = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      machine_id TEXT,
      user_id TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  const createIndexSql = `
    CREATE INDEX IF NOT EXISTS idx_audit_logs_event_time
    ON audit_logs (event_type, created_at DESC);
  `;

  const createMachineIndexSql = `
    CREATE INDEX IF NOT EXISTS idx_audit_logs_machine_time
    ON audit_logs (machine_id, created_at DESC);
  `;

  try {

    await pool.query(createTableSql);
    await pool.query(createIndexSql);
    await pool.query(createMachineIndexSql);

    console.log("🗄️  audit_logs table ready");

  } catch (error) {

    console.error(
      "❌ Failed to initialize audit_logs table:",
      error.message
    );
  }
}


// ========================================
// LOG AN AUDIT EVENT
// ========================================
//
// Fire-and-forget by design (callers should .catch() this, not
// await it inline in a hot path) — a logging failure should
// never block the actual security-relevant action itself.
//
// Recognized event_type values (not enforced, just convention):
//   PAIRING_CREATED, PAIRING_COMPLETED, AUTH_FAILED,
//   AUTH_LEGACY_FALLBACK, SECRET_MIGRATED,
//   SECRET_MIGRATION_REJECTED, SECRET_ROTATED,
//   UNAUTHORIZED_ACCESS, COMMAND_REJECTED
//
// ========================================

async function logAuditEvent(
  eventType,
  {
    machineId = null,
    userId = null,
    details = null,
  } = {}
) {

  if (!pool) {
    return null;
  }

  try {

    const result = await pool.query(
      `INSERT INTO audit_logs
        (event_type, machine_id, user_id, details)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [
        eventType,
        machineId,
        userId,
        details ? JSON.stringify(details) : null,
      ]
    );

    return result.rows[0] || null;

  } catch (error) {

    console.error(
      `⚠️ Failed to log audit event [${eventType}]:`,
      error.message
    );

    return null;
  }
}


// ========================================
// GET AUDIT LOGS
// ========================================

async function getAuditLogs({
  machineId,
  eventType,
  limit = 100,
} = {}) {

  if (!pool) {
    return [];
  }

  const conditions = [];
  const values = [];

  if (machineId) {
    values.push(machineId);
    conditions.push(`machine_id = $${values.length}`);
  }

  if (eventType) {
    values.push(eventType);
    conditions.push(`event_type = $${values.length}`);
  }

  const whereClause =
    conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

  values.push(
    Math.min(limit, 500)
  );

  try {

    const result = await pool.query(
      `SELECT id, event_type, machine_id, user_id, details, created_at
       FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values
    );

    return result.rows;

  } catch (error) {

    console.error(
      "⚠️ Failed to fetch audit logs:",
      error.message
    );

    return [];
  }
}


// ========================================
// EXPORTS
// ========================================

module.exports = {
  ensureAuditLogsTable,
  logAuditEvent,
  getAuditLogs,
};
