-- Crime Prediction & Analysis System - PostgreSQL schema
-- Idempotent: every statement is safe to run more than once.

CREATE TABLE IF NOT EXISTS app_meta (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Operational entities
-- `data` holds the complete API object so response shapes stay identical.
-- The extra typed columns exist for filtering / indexing / map queries.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT,
    role        TEXT,
    status      TEXT,
    password    TEXT,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

CREATE TABLE IF NOT EXISTS officers (
    id             TEXT PRIMARY KEY,
    badge_number   TEXT,
    name           TEXT,
    rank           TEXT,
    district       TEXT,
    status         TEXT,
    latitude       DOUBLE PRECISION,
    longitude      DOUBLE PRECISION,
    last_updated   TIMESTAMPTZ,
    data           JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS officers_status_idx ON officers (status);
CREATE INDEX IF NOT EXISTS officers_district_idx ON officers (district);

CREATE TABLE IF NOT EXISTS firs (
    id             TEXT PRIMARY KEY,
    fir_number     TEXT,
    crime_type     TEXT,
    status         TEXT,
    severity       TEXT,
    priority       TEXT,
    district       TEXT,
    state          TEXT,
    latitude       DOUBLE PRECISION,
    longitude      DOUBLE PRECISION,
    incident_date  TIMESTAMPTZ,
    data           JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS firs_status_idx ON firs (status);
CREATE INDEX IF NOT EXISTS firs_district_idx ON firs (district);
CREATE INDEX IF NOT EXISTS firs_crime_type_idx ON firs (crime_type);

CREATE TABLE IF NOT EXISTS cases (
    id          TEXT PRIMARY KEY,
    case_number TEXT,
    name        TEXT,
    status      TEXT,
    priority    TEXT,
    crime_type  TEXT,
    district    TEXT,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases (status);
CREATE INDEX IF NOT EXISTS cases_district_idx ON cases (district);

CREATE TABLE IF NOT EXISTS crime_reports (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    crime_type   TEXT,
    status       TEXT,
    district     TEXT,
    state        TEXT,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    incident_date TIMESTAMPTZ,
    data         JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crime_reports_status_idx ON crime_reports (status);
CREATE INDEX IF NOT EXISTS crime_reports_district_idx ON crime_reports (district);

CREATE TABLE IF NOT EXISTS sos_alerts (
    id           TEXT PRIMARY KEY,
    user_id      TEXT,
    alert_type   TEXT,
    priority     TEXT,
    status       TEXT,
    district     TEXT,
    latitude     DOUBLE PRECISION,
    longitude    DOUBLE PRECISION,
    assigned_officer_id TEXT,
    data         JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sos_alerts_status_idx ON sos_alerts (status);
CREATE INDEX IF NOT EXISTS sos_alerts_created_idx ON sos_alerts (created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    type        TEXT,
    read        BOOLEAN,
    priority    TEXT,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    action      TEXT,
    entity_type TEXT,
    entity_id   TEXT,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    data        JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
    id          TEXT PRIMARY KEY,
    report_type TEXT,
    format      TEXT,
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);

-- ---------------------------------------------------------------------------
-- Historical crime records (imported once from dstrIPC_1 (1).csv)
-- These are AGGREGATED district/year counts published by the dataset - they
-- are NOT individual incident coordinates.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crime_records (
    state       TEXT NOT NULL,
    district    TEXT NOT NULL,
    year        INTEGER NOT NULL,
    crime_type  TEXT NOT NULL,
    crime_count BIGINT NOT NULL,
    PRIMARY KEY (state, district, year, crime_type)
);
CREATE INDEX IF NOT EXISTS crime_records_district_idx ON crime_records (district);
CREATE INDEX IF NOT EXISTS crime_records_year_idx ON crime_records (year);
CREATE INDEX IF NOT EXISTS crime_records_state_idx ON crime_records (state);
CREATE INDEX IF NOT EXISTS crime_records_type_idx ON crime_records (crime_type);

-- ---------------------------------------------------------------------------
-- Insertion order column (keeps API list ordering stable across restarts)
-- ---------------------------------------------------------------------------
ALTER TABLE users          ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE officers       ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE firs           ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cases          ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crime_reports  ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sos_alerts     ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications  ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_logs     ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reports        ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0;
