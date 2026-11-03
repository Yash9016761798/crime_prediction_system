const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config.cjs');

// ---------------------------------------------------------------------------
// Database configuration. PostgreSQL is optional for the live demo: when
// DATABASE_URL is not provided the backend keeps full functionality using
// in-memory arrays (seeded fixtures) and skips all persistence.
let pool = null;
let isDatabaseConfigured = false;

if (config.DATABASE_URL) {
  pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on('error', err => {
    console.error('[db] idle client error:', err.message);
  });
  isDatabaseConfigured = true;
} else {
  console.warn('[db] DATABASE_URL not set - running in in-memory (demo) mode. PostgreSQL persistence is disabled.');
}

function requireDatabase() {
  if (!isDatabaseConfigured || !pool) {
    const err = new Error('Database not configured. Set DATABASE_URL in .env for PostgreSQL persistence.');
    err.code = 'DB_NOT_CONFIGURED';
    throw err;
  }
}

async function query(text, params) {
  requireDatabase();
  return pool.query(text, params);
}

async function one(text, params) {
  requireDatabase();
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

async function many(text, params) {
  requireDatabase();
  const { rows } = await pool.query(text, params);
  return rows;
}

// ---------------------------------------------------------------------------
// Entity registry
// `data` always holds the complete object so API responses stay identical.
// The typed columns are derived copies used for filtering / map queries.
// ---------------------------------------------------------------------------
const ENTITIES = {
  users: 'users',
  officers: 'officers',
  firs: 'firs',
  cases: 'cases',
  crimeReports: 'crime_reports',
  sosAlerts: 'sos_alerts',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  generatedReports: 'reports',
};

const COLUMNS = {
  users: {
    email: o => o.email ?? null,
    role: o => o.role ?? null,
    status: o => o.status ?? null,
    password: o => o.__password ?? null,
  },
  officers: {
    badge_number: o => o.badgeNumber ?? null,
    name: o => o.name ?? null,
    rank: o => o.rank ?? null,
    district: o => o.district ?? null,
    status: o => o.status ?? null,
    latitude: o => (o.currentLocation ? o.currentLocation.latitude : null),
    longitude: o => (o.currentLocation ? o.currentLocation.longitude : null),
    last_updated: o => (o.currentLocation ? o.currentLocation.timestamp : null),
  },
  firs: {
    fir_number: o => o.firNumber ?? null,
    crime_type: o => o.crimeType ?? null,
    status: o => o.status ?? null,
    severity: o => o.severity ?? null,
    priority: o => o.priority ?? null,
    district: o => o.district ?? null,
    state: o => o.state ?? null,
    latitude: o => o.latitude ?? null,
    longitude: o => o.longitude ?? null,
    incident_date: o => o.incidentDate ?? null,
  },
  cases: {
    case_number: o => o.caseNumber ?? null,
    name: o => o.name ?? null,
    status: o => o.status ?? null,
    priority: o => o.priority ?? null,
    crime_type: o => o.crimeType ?? null,
    district: o => o.district ?? null,
  },
  crime_reports: {
    user_id: o => o.userId ?? null,
    crime_type: o => o.crimeType ?? null,
    status: o => o.status ?? null,
    district: o => o.district ?? null,
    state: o => o.state ?? null,
    latitude: o => o.latitude ?? null,
    longitude: o => o.longitude ?? null,
    incident_date: o => o.incidentDate ?? null,
  },
  sos_alerts: {
    user_id: o => o.userId ?? null,
    alert_type: o => o.alertType ?? null,
    priority: o => o.priority ?? null,
    status: o => o.status ?? null,
    district: o => o.district ?? null,
    latitude: o => o.latitude ?? null,
    longitude: o => o.longitude ?? null,
    assigned_officer_id: o => o.assignedOfficerId ?? null,
  },
  notifications: {
    user_id: o => o.userId ?? null,
    type: o => o.type ?? null,
    read: o => Boolean(o.read),
    priority: o => o.priority ?? null,
  },
  audit_logs: {
    user_id: o => o.userId ?? null,
    action: o => o.action ?? null,
    entity_type: o => o.entityType ?? null,
    entity_id: o => o.entityId ?? null,
  },
  reports: {
    report_type: o => o.reportType ?? null,
    format: o => o.format ?? null,
  },
  predictions: {
    district: o => o.district ?? null,
    crime_type: o => o.crimeType ?? null,
    period: o => o.period ?? null,
  },
  risk_scores: {
    district: o => o.district ?? null,
    score: o => (typeof o.score === 'number' ? o.score : null),
    level: o => o.level ?? null,
    period: o => o.period ?? null,
  },
};

// Keep the append-only logs from growing without bound.
const MAX_ROWS = { audit_logs: 1000, notifications: 500, generatedReports: 100 };

const BATCH_SIZE = 400;

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
async function migrate() {
  if (!isDatabaseConfigured) {
    console.warn('[db] migrate skipped - database not configured (in-memory mode)');
    return;
  }
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
}

// ---------------------------------------------------------------------------
// Meta (idempotent seed marker)
// ---------------------------------------------------------------------------
async function getMeta(key) {
  if (!isDatabaseConfigured) return null;
  const row = await one('SELECT value FROM app_meta WHERE key = $1', [key]);
  return row ? row.value : null;
}

async function setMeta(key, value) {
  if (!isDatabaseConfigured) return;
  await query(
    `INSERT INTO app_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

// ---------------------------------------------------------------------------
// Read / write entities
// ---------------------------------------------------------------------------
function sortRows(rows) {
  return [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function normalizeRows(table, rows) {
  const capped = MAX_ROWS[table];
  let list = rows.map((row, index) => ({
    ...row,
    id: row.id != null ? String(row.id) : `${table}-${Date.now()}-${index}`,
  }));
  if (capped && list.length > capped) {
    list = list
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, capped);
  }
  return list;
}

function buildInsert(table, rows) {
  const extra = Object.keys(COLUMNS[table] || {});
  const columns = ['id', 'pos', 'data', ...extra];
  const params = [];
  const values = [];
  rows.forEach((row, index) => {
    const offset = index * columns.length;
    const clean = { ...row };
    const password = clean.__password ?? null;
    delete clean.__password;
    const extracted = extra.map(col => COLUMNS[table][col]({ ...clean, __password: password }));
    values.push(`(${columns.map((_, i) => `$${offset + i + 1}`).join(', ')})`);
    params.push(row.id, index, JSON.stringify(clean), ...extracted);
  });
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}
               ON CONFLICT (id) DO UPDATE SET pos = EXCLUDED.pos, data = EXCLUDED.data, ${extra
                 .map(col => `${col} = EXCLUDED.${col}`)
                 .join(', ')}, updated_at = now()`;
  return { sql, params };
}

async function saveEntity(table, inputRows) {
  const rows = normalizeRows(table, inputRows);
  if (!isDatabaseConfigured) {
    console.warn(`[db] saveEntity skipped for '${table}' - database not configured (in-memory mode)`);
    return rows.length;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ${table}`);
    if (rows.length) {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const slice = rows.slice(i, i + BATCH_SIZE);
        const { sql, params } = buildInsert(table, slice);
        await client.query(sql, params);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return rows.length;
}

async function loadEntity(table) {
  if (!isDatabaseConfigured) {
    console.warn(`[db] loadEntity skipped for '${table}' - database not configured (in-memory mode)`);
    return [];
  }
  const { rows } = await pool.query(`SELECT data FROM ${table} ORDER BY pos, id`);
  return rows.map(row => row.data);
}

async function loadUsers() {
  if (!isDatabaseConfigured) {
    console.warn('[db] loadUsers skipped - database not configured (in-memory mode)');
    return [];
  }
  const { rows } = await pool.query('SELECT data, password, pos FROM users ORDER BY pos, id');
  return rows.map(row => {
    const data = { ...row.data };
    if (row.password) data.__password = row.password;
    return data;
  });
}

async function loadSettings() {
  if (!isDatabaseConfigured) {
    console.warn('[db] loadSettings skipped - database not configured (in-memory mode)');
    return null;
  }
  const row = await one("SELECT data FROM settings WHERE key = 'app'");
  return row ? row.data : null;
}

async function saveSettings(settings) {
  if (!isDatabaseConfigured) {
    console.warn('[db] saveSettings skipped - database not configured (in-memory mode)');
    return;
  }
  await query(
    `INSERT INTO settings (key, data, updated_at) VALUES ('app', $1, now())
     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [JSON.stringify(settings)]
  );
}

// ---------------------------------------------------------------------------
// Historical crime records
// ---------------------------------------------------------------------------
async function crimeRecordsCount() {
  if (!isDatabaseConfigured) return 0;
  const row = await one('SELECT COUNT(*)::int AS n FROM crime_records');
  return row ? row.n : 0;
}

async function importCrimeRecords(records) {
  const client = await pool.connect();
  const size = 2000;
  try {
    await client.query('BEGIN');
    for (let i = 0; i < records.length; i += size) {
      const slice = records.slice(i, i + size);
      const params = [];
      const tuples = slice.map((r, idx) => {
        const base = idx * 5;
        params.push(r.state, r.district, r.year, r.crimeType, r.count);
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });
      await client.query(
        `INSERT INTO crime_records (state, district, year, crime_type, crime_count)
         VALUES ${tuples.join(', ')}
         ON CONFLICT (state, district, year, crime_type)
         DO UPDATE SET crime_count = EXCLUDED.crime_count`,
        params
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function loadCrimeRecords() {
  if (!isDatabaseConfigured) {
    console.warn('[db] loadCrimeRecords skipped - database not configured (in-memory mode)');
    return [];
  }
  const { rows } = await pool.query(
    'SELECT state, district, year, crime_type, crime_count FROM crime_records ORDER BY state, district, year, crime_type'
  );
  return rows.map(r => ({
    id: 0,
    state: r.state,
    district: r.district,
    year: r.year,
    crimeType: r.crime_type,
    count: Number(r.crime_count),
  }));
}

async function healthCheck() {
  if (!isDatabaseConfigured) return false;
  try {
    const row = await one('SELECT 1 AS ok');
    return Boolean(row && row.ok === 1);
  } catch {
    return false;
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = {
  pool,
  query,
  one,
  many,
  migrate,
  getMeta,
  setMeta,
  ENTITIES,
  saveEntity,
  loadEntity,
  loadUsers,
  loadSettings,
  saveSettings,
  crimeRecordsCount,
  importCrimeRecords,
  loadCrimeRecords,
  healthCheck,
  close,
  isDatabaseConfigured,
};
