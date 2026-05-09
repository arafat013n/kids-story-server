"use strict";

const path = require("path");

function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return defaultValue;
}

function toNumber(value, defaultValue) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return defaultValue;
  }

  return number;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "http://127.0.0.1:3000";
  }

  if (raw.endsWith("/")) {
    return raw.slice(0, -1);
  }

  return raw;
}

function normalizePath(value, fallback) {
  const raw = String(value || "").trim();

  if (!raw) {
    return fallback;
  }

  if (path.isAbsolute(raw)) {
    return raw;
  }

  return path.join(fallback, raw);
}

function parseAllowedExtensions(value) {
  const raw = String(value || "mp3,wav,m4a");

  return raw
    .split(",")
    .map(function (item) {
      return item.trim().toLowerCase().replace(".", "");
    })
    .filter(function (item) {
      return item.length > 0;
    });
}

function isWeakSecret(value) {
  const weakValues = [
    "",
    "change_this_main_server_secret_2026_make_it_long",
    "change_this_admin_login_secret_2026",
    "change_this_admin_server_secret_2026_make_it_long",
    "secret",
    "password",
    "123456",
    "admin"
  ];

  const cleanValue = String(value || "").trim();

  if (weakValues.includes(cleanValue)) {
    return true;
  }

  return cleanValue.length < 24;
}

const ROOT_DIR = path.join(__dirname, "..", "..");

const DATA_DIR = normalizePath(
  process.env.DATA_DIR,
  path.join(ROOT_DIR, "data")
);

const AUDIO_DIR = normalizePath(
  process.env.AUDIO_DIR,
  path.join(ROOT_DIR, "audio")
);

const DB_PATH = String(process.env.DB_PATH || "").trim()
  ? normalizePath(process.env.DB_PATH, DATA_DIR)
  : path.join(DATA_DIR, "kids_story.sqlite");

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",

  PORT: toNumber(process.env.PORT, 3000),
  BASE_URL: normalizeBaseUrl(process.env.BASE_URL),

  ROOT_DIR: ROOT_DIR,
  DATA_DIR: DATA_DIR,
  AUDIO_DIR: AUDIO_DIR,
  DB_PATH: DB_PATH,

  MAIN_PACKAGE_NAME: process.env.MAIN_PACKAGE_NAME || "com.akash.kidsaudiostory",
  MAIN_APP_KEY: process.env.MAIN_APP_KEY || "kids_story_main_app_key_2026",
  MAIN_SERVER_SECRET:
    process.env.MAIN_SERVER_SECRET || "change_this_main_server_secret_2026_make_it_long",
  MAIN_TOKEN_EXPIRE_HOURS: toNumber(process.env.MAIN_TOKEN_EXPIRE_HOURS, 720),

  ADMIN_PACKAGE_NAME: process.env.ADMIN_PACKAGE_NAME || "com.akash.kidsaudiostoryadmin",
  ADMIN_LOGIN_SECRET: process.env.ADMIN_LOGIN_SECRET || "change_this_admin_login_secret_2026",
  ADMIN_APP_KEY: process.env.ADMIN_APP_KEY || "kids_story_admin_app_key_2026",
  ADMIN_SERVER_SECRET:
    process.env.ADMIN_SERVER_SECRET || "change_this_admin_server_secret_2026_make_it_long",
  ADMIN_TOKEN_EXPIRE_HOURS: toNumber(process.env.ADMIN_TOKEN_EXPIRE_HOURS, 24),

  PUBLIC_STORIES_ENABLED: toBoolean(process.env.PUBLIC_STORIES_ENABLED, false),
  PUBLIC_AUDIO_ENABLED: toBoolean(process.env.PUBLIC_AUDIO_ENABLED, false),

  MAX_AUDIO_UPLOAD_MB: toNumber(process.env.MAX_AUDIO_UPLOAD_MB, 100),
  ALLOWED_AUDIO_EXTENSIONS: parseAllowedExtensions(process.env.ALLOWED_AUDIO_EXTENSIONS),

  RATE_LIMIT_WINDOW_MS: toNumber(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  RATE_LIMIT_MAX_REQUESTS: toNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 120)
};

function assertEnv() {
  if (env.NODE_ENV !== "production") {
    return;
  }

  if (!env.BASE_URL.startsWith("https://")) {
    throw new Error("Production BASE_URL must use https");
  }

  if (isWeakSecret(env.MAIN_SERVER_SECRET)) {
    throw new Error("Production MAIN_SERVER_SECRET must be strong and changed");
  }

  if (isWeakSecret(env.ADMIN_LOGIN_SECRET)) {
    throw new Error("Production ADMIN_LOGIN_SECRET must be strong and changed");
  }

  if (isWeakSecret(env.ADMIN_SERVER_SECRET)) {
    throw new Error("Production ADMIN_SERVER_SECRET must be strong and changed");
  }

  if (!env.MAIN_PACKAGE_NAME || !env.ADMIN_PACKAGE_NAME) {
    throw new Error("Production package names are required");
  }

  if (!env.MAIN_APP_KEY || !env.ADMIN_APP_KEY) {
    throw new Error("Production app keys are required");
  }
}

module.exports = {
  env,
  assertEnv
};