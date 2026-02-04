/**
 * Database schema types for the context-compacting agent
 */

export interface Session {
  id: string;
  created_at: number;
  updated_at: number;
  summary_text: string | null;
  last_compacted_at: number | null;
  metadata_json: string | null;
}

export interface Message {
  id: number;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  token_count: number | null;
}

export interface Run {
  id: number;
  session_id: string;
  step_no: number;
  status: "running" | "completed" | "failed";
  error: string | null;
  created_at: number;
}

/**
 * SQL schema creation statements
 */
export const SCHEMA_SQL = `
-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  summary_text TEXT,
  last_compacted_at INTEGER,
  metadata_json TEXT
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  token_count INTEGER,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Index for faster message queries
CREATE INDEX IF NOT EXISTS idx_messages_session_created 
  ON messages(session_id, created_at);

-- Runs table (optional tracking)
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'failed')),
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Index for run queries
CREATE INDEX IF NOT EXISTS idx_runs_session 
  ON runs(session_id, step_no);
`;
