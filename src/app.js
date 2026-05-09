"use strict";

const express = require("express");
const cors = require("cors");
const fs = require("fs");

const { env, assertEnv } = require("./config/env");
const { ensureStorageFolders } = require("./utils/file");
const publicRoutes = require("./routes/public.routes");
const mainRoutes = require("./routes/main.routes");
const adminRoutes = require("./routes/admin.routes");
const { error } = require("./utils/response");

assertEnv();
ensureStorageFolders();

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);

function getClientIp(req) {
  try {
    const forwardedFor = String(req.headers["x-forwarded-for"] || "").trim();

    if (forwardedFor.length > 0) {
      return forwardedFor.split(",")[0].trim();
    }

    return String(req.ip || req.socket.remoteAddress || "unknown").trim();
  } catch (e) {
    return "unknown";
  }
}

function isDebugRequest(req) {
  try {
    if (env.NODE_ENV !== "production") {
      return true;
    }

    const url = String(req.originalUrl || "");

    if (url === "/" || url === "/health") {
      return false;
    }

    return false;
  } catch (e) {
    return false;
  }
}

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Device-Id",
      "X-App-Device-Id",
      "X-Admin-Device-Id"
    ],
    maxAge: 86400
  })
);

app.use(
  express.json({
    limit: "5mb",
    strict: true
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb"
  })
);

const rateStore = new Map();

app.use(function rateLimit(req, res, next) {
  try {
    const ip = getClientIp(req);
    const now = Date.now();
    const windowMs = Number(env.RATE_LIMIT_WINDOW_MS || 60000);
    const maxRequests = Number(env.RATE_LIMIT_MAX_REQUESTS || 120);

    const current = rateStore.get(ip);

    if (!current || now > current.resetAt) {
      rateStore.set(ip, {
        count: 1,
        resetAt: now + windowMs
      });

      return next();
    }

    current.count++;

    if (current.count > maxRequests) {
      return error(res, 429, "Too many requests. Please try again later.");
    }

    return next();
  } catch (rateError) {
    return next();
  }
});

setInterval(function cleanupRateStore() {
  try {
    const now = Date.now();

    for (const [key, value] of rateStore.entries()) {
      if (!value || now > value.resetAt) {
        rateStore.delete(key);
      }
    }
  } catch (cleanupError) {}
}, 60000);

app.use(function requestLogger(req, res, next) {
  try {
    if (env.NODE_ENV !== "production" || isDebugRequest(req)) {
      console.log(
        new Date().toISOString() +
          " " +
          req.method +
          " " +
          req.originalUrl +
          " " +
          getClientIp(req)
      );
    }
  } catch (logError) {}

  next();
});

app.use(function ensureRuntimeFolders(req, res, next) {
  try {
    if (!fs.existsSync(env.AUDIO_DIR)) {
      fs.mkdirSync(env.AUDIO_DIR, { recursive: true });
    }

    if (!fs.existsSync(env.DATA_DIR)) {
      fs.mkdirSync(env.DATA_DIR, { recursive: true });
    }
  } catch (folderError) {
    if (env.NODE_ENV !== "production") {
      console.error("Runtime folder error:", folderError.message);
    }
  }

  next();
});

app.get("/healthz", function healthz(req, res) {
  return res.status(200).json({
    success: true,
    status: "ok"
  });
});

app.use("/", publicRoutes);
app.use("/api/main", mainRoutes);
app.use("/api/admin", adminRoutes);

app.use(function notFoundHandler(req, res) {
  return error(res, 404, "API not found", {
    path: req.originalUrl
  });
});

app.use(function globalErrorHandler(err, req, res, next) {
  try {
    const message = err && err.message ? err.message : "Unknown server error";

    if (env.NODE_ENV === "production") {
      console.error("Server Error:", message);
    } else {
      console.error("Server Error:", err);
    }

    return error(res, 500, "Internal server error", {
      detail: env.NODE_ENV === "development" ? message : undefined
    });
  } catch (finalError) {
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});

module.exports = app;