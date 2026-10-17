CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL, data TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 missing_runs INTEGER NOT NULL DEFAULT 0, first_seen TEXT NOT NULL,
 last_seen TEXT NOT NULL, category_override TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_source_active ON jobs(source_id,active);
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, data TEXT NOT NULL, checked TEXT, status TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS runs (
 id TEXT PRIMARY KEY, started TEXT NOT NULL, finished TEXT, status TEXT NOT NULL,
 checked INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
 added INTEGER NOT NULL DEFAULT 0, changed INTEGER NOT NULL DEFAULT 0,
 closed INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_refresh ON runs(status) WHERE status='running';
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, window_start BIGINT NOT NULL, attempts INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS ingest_receipts (
 run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL, result JSONB NOT NULL,
 PRIMARY KEY(run_id,batch_id)
);
