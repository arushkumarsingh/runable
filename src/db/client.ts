import Database from "better-sqlite3";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { SCHEMA_SQL, type Session, type Message, type Run } from "./schema.js";
import { randomUUID } from "crypto";

let db: Database.Database;

/**
 * Initialize the database and run migrations
 */
export function initDB() {
  logger.info({ path: config.dbPath }, "Initializing database");
  
  db = new Database(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  
  // Run schema creation
  db.exec(SCHEMA_SQL);
  
  logger.info("Database initialized");
  return db;
}

/**
 * Get the database instance
 */
export function getDB(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDB() first.");
  }
  return db;
}

/**
 * Create a new session
 */
export function createSession(metadata?: Record<string, any>): Session {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO sessions (id, created_at, updated_at, metadata_json)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(id, now, now, metadata ? JSON.stringify(metadata) : null);
  
  logger.info({ sessionId: id }, "Created new session");
  
  return {
    id,
    created_at: now,
    updated_at: now,
    summary_text: null,
    last_compacted_at: null,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  };
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): Session | null {
  const stmt = db.prepare("SELECT * FROM sessions WHERE id = ?");
  return stmt.get(sessionId) as Session | null;
}

/**
 * Get all sessions ordered by updated_at
 */
export function getAllSessions(limit: number = 10): Session[] {
  const stmt = db.prepare(`
    SELECT * FROM sessions 
    ORDER BY updated_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as Session[];
}

/**
 * Append a message to a session
 */
export function appendMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  tokenCount?: number
): Message {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO messages (session_id, role, content, created_at, token_count)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  const info = stmt.run(sessionId, role, content, now, tokenCount ?? null);
  
  // Update session's updated_at
  const updateStmt = db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?");
  updateStmt.run(now, sessionId);
  
  logger.debug({ sessionId, role, messageId: info.lastInsertRowid }, "Appended message");
  
  return {
    id: Number(info.lastInsertRowid),
    session_id: sessionId,
    role,
    content,
    created_at: now,
    token_count: tokenCount ?? null,
  };
}

/**
 * Get recent messages for a session
 */
export function getRecentMessages(sessionId: string, limit: number = 50): Message[] {
  const stmt = db.prepare(`
    SELECT * FROM messages 
    WHERE session_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  
  const messages = stmt.all(sessionId, limit) as Message[];
  return messages.reverse(); // Return in chronological order
}

/**
 * Get all messages for a session
 */
export function getAllMessages(sessionId: string): Message[] {
  const stmt = db.prepare(`
    SELECT * FROM messages 
    WHERE session_id = ? 
    ORDER BY created_at ASC
  `);
  
  return stmt.all(sessionId) as Message[];
}

/**
 * Set summary text for a session after compaction
 */
export function setSummary(sessionId: string, summaryText: string): void {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    UPDATE sessions 
    SET summary_text = ?, last_compacted_at = ?, updated_at = ?
    WHERE id = ?
  `);
  
  stmt.run(summaryText, now, now, sessionId);
  
  logger.info({ sessionId }, "Updated session summary");
}

/**
 * Delete old messages from a session (after compaction)
 */
export function deleteMessagesBeforeId(sessionId: string, beforeMessageId: number): number {
  const stmt = db.prepare(`
    DELETE FROM messages 
    WHERE session_id = ? AND id < ?
  `);
  
  const info = stmt.run(sessionId, beforeMessageId);
  
  logger.info({ sessionId, deletedCount: info.changes }, "Deleted old messages");
  
  return info.changes;
}

/**
 * Create a new run entry
 */
export function createRun(sessionId: string, stepNo: number): Run {
  const now = Math.floor(Date.now() / 1000);
  
  const stmt = db.prepare(`
    INSERT INTO runs (session_id, step_no, status, created_at)
    VALUES (?, ?, 'running', ?)
  `);
  
  const info = stmt.run(sessionId, stepNo, now);
  
  return {
    id: Number(info.lastInsertRowid),
    session_id: sessionId,
    step_no: stepNo,
    status: "running",
    error: null,
    created_at: now,
  };
}

/**
 * Update run status
 */
export function updateRun(
  runId: number, 
  status: "running" | "completed" | "failed",
  error?: string
): void {
  const stmt = db.prepare(`
    UPDATE runs 
    SET status = ?, error = ?
    WHERE id = ?
  `);
  
  stmt.run(status, error ?? null, runId);
}

/**
 * Get total token count for a session
 */
export function getTotalTokenCount(sessionId: string): number {
  const stmt = db.prepare(`
    SELECT COALESCE(SUM(token_count), 0) as total
    FROM messages
    WHERE session_id = ? AND token_count IS NOT NULL
  `);
  
  const result = stmt.get(sessionId) as { total: number };
  return result.total;
}

/**
 * Close the database connection
 */
export function closeDB(): void {
  if (db) {
    db.close();
    logger.info("Database connection closed");
  }
}