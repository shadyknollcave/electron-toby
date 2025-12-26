import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export function initializeDatabase(dbPath: string): Database.Database {
  // Ensure directory exists
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)

  // Enable foreign keys
  db.pragma('foreign_keys = ON')

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT,
      model TEXT NOT NULL,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER,
      top_p REAL DEFAULT 1.0,
      presence_penalty REAL DEFAULT 0.0,
      frequency_penalty REAL DEFAULT 0.0,
      system_prompt TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stdio', 'http')),
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers(enabled);
    CREATE INDEX IF NOT EXISTS idx_chat_history_created ON chat_history(created_at DESC);
  `)

  return db
}

export function createTestDatabase(): Database.Database {
  // Use in-memory database for tests
  const db = new Database(':memory:')

  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE llm_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      base_url TEXT NOT NULL,
      api_key_encrypted TEXT,
      model TEXT NOT NULL,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER,
      top_p REAL DEFAULT 1.0,
      presence_penalty REAL DEFAULT 0.0,
      frequency_penalty REAL DEFAULT 0.0,
      system_prompt TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('stdio', 'http')),
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE chat_history (
      id TEXT PRIMARY KEY,
      messages TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_mcp_servers_enabled ON mcp_servers(enabled);
    CREATE INDEX idx_chat_history_created ON chat_history(created_at DESC);
  `)

  return db
}
