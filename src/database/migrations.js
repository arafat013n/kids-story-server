"use strict";

const { db, ensureFolders, ensureDatabaseFile } = require("./db");
const { env } = require("../config/env");

function safeName(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_]/g, "");
}

function columnExists(tableName, columnName) {
  const safeTableName = safeName(tableName);
  const safeColumnName = safeName(columnName);

  if (!safeTableName || !safeColumnName) {
    return false;
  }

  const rows = db.all("PRAGMA table_info(" + safeTableName + ");");

  for (let i = 0; i < rows.length; i++) {
    if (rows[i].name === safeColumnName) {
      return true;
    }
  }

  return false;
}

function addColumnIfMissing(tableName, columnName, columnDefinition) {
  const safeTableName = safeName(tableName);
  const safeColumnName = safeName(columnName);
  const safeDefinition = String(columnDefinition || "").trim();

  if (!safeTableName || !safeColumnName || !safeDefinition) {
    return;
  }

  if (!columnExists(safeTableName, safeColumnName)) {
    db.exec(
      "ALTER TABLE " +
        safeTableName +
        " ADD COLUMN " +
        safeColumnName +
        " " +
        safeDefinition +
        ";"
    );
  }
}

function runMigrations() {
  ensureFolders();
  ensureDatabaseFile();

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      story_number INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      duration TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      audio_path TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      popular INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_stories_story_number
      ON stories(story_number);

    CREATE INDEX IF NOT EXISTS idx_stories_active
      ON stories(active);

    CREATE INDEX IF NOT EXISTS idx_stories_popular
      ON stories(popular);

    CREATE INDEX IF NOT EXISTS idx_stories_category
      ON stories(category);

    CREATE INDEX IF NOT EXISTS idx_stories_created_at
      ON stories(created_at);

    CREATE INDEX IF NOT EXISTS idx_stories_updated_at
      ON stories(updated_at);

    CREATE TABLE IF NOT EXISTS token_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_type TEXT NOT NULL,
      device_id TEXT NOT NULL,
      package_name TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_token_logs_app_type
      ON token_logs(app_type);

    CREATE INDEX IF NOT EXISTS idx_token_logs_device_id
      ON token_logs(device_id);

    CREATE INDEX IF NOT EXISTS idx_token_logs_created_at
      ON token_logs(created_at);

    CREATE TABLE IF NOT EXISTS upload_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_md5 TEXT NOT NULL DEFAULT '',
      uploaded_by_device_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_upload_logs_story_id
      ON upload_logs(story_id);

    CREATE INDEX IF NOT EXISTS idx_upload_logs_file_name
      ON upload_logs(file_name);

    CREATE INDEX IF NOT EXISTS idx_upload_logs_created_at
      ON upload_logs(created_at);

    CREATE TABLE IF NOT EXISTS admin_action_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      story_id TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_admin_action_logs_action
      ON admin_action_logs(action);

    CREATE INDEX IF NOT EXISTS idx_admin_action_logs_story_id
      ON admin_action_logs(story_id);

    CREATE INDEX IF NOT EXISTS idx_admin_action_logs_device_id
      ON admin_action_logs(device_id);

    CREATE INDEX IF NOT EXISTS idx_admin_action_logs_created_at
      ON admin_action_logs(created_at);
  `);

  addColumnIfMissing("stories", "duration", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("stories", "category", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("stories", "popular", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("stories", "active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfMissing("stories", "created_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  addColumnIfMissing("stories", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

  addColumnIfMissing("upload_logs", "file_md5", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("upload_logs", "uploaded_by_device_id", "TEXT NOT NULL DEFAULT ''");

  addColumnIfMissing("token_logs", "ip_address", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("token_logs", "user_agent", "TEXT NOT NULL DEFAULT ''");

  addColumnIfMissing("admin_action_logs", "device_id", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("admin_action_logs", "detail", "TEXT NOT NULL DEFAULT ''");

  if (env.NODE_ENV !== "production") {
    console.log("Database migrations completed");
  }
}

module.exports = {
  runMigrations
};