"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { env } = require("../config/env");

let sqliteInstance = null;
let betterSqliteAvailable = false;
let BetterSqliteDatabase = null;

try {
  BetterSqliteDatabase = require("better-sqlite3");
  betterSqliteAvailable = true;
} catch (error) {
  betterSqliteAvailable = false;
}

function ensureFolders() {
  try {
    if (!fs.existsSync(env.DATA_DIR)) {
      fs.mkdirSync(env.DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(env.AUDIO_DIR)) {
      fs.mkdirSync(env.AUDIO_DIR, { recursive: true });
    }
  } catch (error) {
    throw new Error("Storage folder create failed: " + error.message);
  }
}

function ensureDatabaseFile() {
  ensureFolders();

  try {
    const dbDir = path.dirname(env.DB_PATH);

    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(env.DB_PATH)) {
      fs.writeFileSync(env.DB_PATH, "", "utf8");
    }
  } catch (error) {
    throw new Error("Database file create failed: " + error.message);
  }
}

function openDatabase() {
  if (!betterSqliteAvailable) {
    return null;
  }

  if (sqliteInstance) {
    return sqliteInstance;
  }

  ensureDatabaseFile();

  try {
    sqliteInstance = new BetterSqliteDatabase(env.DB_PATH);

    sqliteInstance.pragma("journal_mode = WAL");
    sqliteInstance.pragma("foreign_keys = ON");
    sqliteInstance.pragma("busy_timeout = 5000");

    return sqliteInstance;
  } catch (error) {
    betterSqliteAvailable = false;
    sqliteInstance = null;
    return null;
  }
}

function runSqliteCli(inputSql) {
  ensureDatabaseFile();

  try {
    return childProcess.execFileSync("sqlite3", [env.DB_PATH], {
      input: inputSql,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20
    });
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : "";
    const stdout = error.stdout ? error.stdout.toString() : "";
    const message = stderr || stdout || error.message || "SQLite command failed";

    throw new Error(message.trim());
  }
}

function escapeValue(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "NULL";
    }

    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  const text = String(value).replace(/'/g, "''");
  return "'" + text + "'";
}

function exec(sql) {
  const query = String(sql || "").trim();

  if (!query) {
    return;
  }

  const database = openDatabase();

  if (database) {
    database.exec(query);
    return;
  }

  runSqliteCli(query);
}

function run(sql) {
  const query = String(sql || "").trim();

  if (!query) {
    return {
      changes: 0,
      lastInsertRowid: 0
    };
  }

  const database = openDatabase();

  if (database) {
    const result = database.prepare(query).run();

    return {
      changes: Number(result.changes || 0),
      lastInsertRowid: Number(result.lastInsertRowid || 0)
    };
  }

  runSqliteCli(query);

  return {
    changes: 0,
    lastInsertRowid: 0
  };
}

function all(sql) {
  const query = String(sql || "").trim();

  if (!query) {
    return [];
  }

  const database = openDatabase();

  if (database) {
    const rows = database.prepare(query).all();

    if (Array.isArray(rows)) {
      return rows;
    }

    return [];
  }

  const output = runSqliteCli(".mode json\n" + query);

  if (!output || !output.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(output);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch (error) {
    return [];
  }
}

function get(sql) {
  const query = String(sql || "").trim();

  if (!query) {
    return null;
  }

  const database = openDatabase();

  if (database) {
    const row = database.prepare(query).get();
    return row || null;
  }

  const rows = all(query);

  if (rows.length > 0) {
    return rows[0];
  }

  return null;
}

function transaction(callback) {
  if (typeof callback !== "function") {
    throw new Error("Transaction callback is required");
  }

  const database = openDatabase();

  if (database) {
    const wrapped = database.transaction(function () {
      return callback();
    });

    return wrapped();
  }

  return callback();
}

function closeDatabase() {
  try {
    if (sqliteInstance) {
      sqliteInstance.close();
      sqliteInstance = null;
    }
  } catch (error) {}
}

const db = {
  exec,
  run,
  all,
  get,
  transaction,
  escapeValue,
  closeDatabase
};

module.exports = {
  db,
  ensureFolders,
  ensureDatabaseFile,
  openDatabase,
  closeDatabase
};