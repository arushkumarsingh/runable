import { getDB } from "./client.js";
import { logger } from "../utils/logger.js";

/**
 * Migration system for database schema changes
 */

interface Migration {
  id: number;
  name: string;
  sql: string;
}

/**
 * List of migrations in order
 */
const migrations: Migration[] = [
  // Add future migrations here as needed
  // Example:
  // {
  //   id: 1,
  //   name: "add_user_preferences",
  //   sql: `ALTER TABLE sessions ADD COLUMN preferences_json TEXT;`,
  // },
];

/**
 * Initialize migrations table
 */
function initMigrationsTable() {
  const db = getDB();
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
}

/**
 * Get applied migrations
 */
function getAppliedMigrations(): Set<number> {
  const db = getDB();
  const stmt = db.prepare("SELECT id FROM migrations");
  const rows = stmt.all() as { id: number }[];
  return new Set(rows.map(r => r.id));
}

/**
 * Apply a single migration
 */
function applyMigration(migration: Migration) {
  const db = getDB();
  
  logger.info({ migrationId: migration.id, name: migration.name }, "Applying migration");
  
  db.exec(migration.sql);
  
  const stmt = db.prepare("INSERT INTO migrations (id, name) VALUES (?, ?)");
  stmt.run(migration.id, migration.name);
  
  logger.info({ migrationId: migration.id }, "Migration applied");
}

/**
 * Run all pending migrations
 */
export function runMigrations() {
  initMigrationsTable();
  
  const applied = getAppliedMigrations();
  const pending = migrations.filter(m => !applied.has(m.id));
  
  if (pending.length === 0) {
    logger.debug("No pending migrations");
    return;
  }
  
  logger.info({ count: pending.length }, "Running migrations");
  
  for (const migration of pending) {
    applyMigration(migration);
  }
  
  logger.info("All migrations completed");
}
