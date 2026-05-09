"use strict";

require("dotenv").config();

const app = require("./src/app");
const { env, assertEnv } = require("./src/config/env");
const { runMigrations } = require("./src/database/migrations");

function logStartupInfo() {
  console.log("Kids Audio Story Server started");
  console.log("PORT:", env.PORT);
  console.log("NODE_ENV:", env.NODE_ENV);

  if (env.NODE_ENV !== "production") {
    console.log("BASE_URL:", env.BASE_URL);
    console.log("PUBLIC_STORIES_ENABLED:", env.PUBLIC_STORIES_ENABLED);
    console.log("PUBLIC_AUDIO_ENABLED:", env.PUBLIC_AUDIO_ENABLED);
    console.log("");
    console.log("Available APIs:");
    console.log("GET  /");
    console.log("GET  /health");
    console.log("POST /api/main/token");
    console.log("GET  /api/main/stories");
    console.log("GET  /api/main/audio/:fileName");
    console.log("POST /api/admin/login");
    console.log("GET  /api/admin/stories");
    console.log("GET  /api/admin/next-story-id");
    console.log("POST /api/admin/stories");
    console.log("PATCH /api/admin/stories/:id");
    console.log("DELETE /api/admin/stories/:id");
  }
}

function startServer() {
  let server = null;

  try {
    assertEnv();
    runMigrations();

    const port = Number(env.PORT || process.env.PORT || 3000);
    const host = "0.0.0.0";

    server = app.listen(port, host, function () {
      logStartupInfo();
    });

    server.on("error", function (error) {
      console.error("Server listen error:", error.message);
      process.exit(1);
    });

    function shutdown(signal) {
      console.log("Received " + signal + ". Shutting down...");

      if (!server) {
        process.exit(0);
        return;
      }

      server.close(function () {
        console.log("Server closed");
        process.exit(0);
      });

      setTimeout(function () {
        console.error("Force shutdown after timeout");
        process.exit(1);
      }, 10000);
    }

    process.on("SIGINT", function () {
      shutdown("SIGINT");
    });

    process.on("SIGTERM", function () {
      shutdown("SIGTERM");
    });

    process.on("uncaughtException", function (error) {
      console.error("Uncaught exception:", error.message);

      if (env.NODE_ENV !== "production") {
        console.error(error);
      }

      process.exit(1);
    });

    process.on("unhandledRejection", function (reason) {
      if (reason && reason.message) {
        console.error("Unhandled rejection:", reason.message);
      } else {
        console.error("Unhandled rejection");
      }

      if (env.NODE_ENV !== "production") {
        console.error(reason);
      }

      process.exit(1);
    });
  } catch (error) {
    console.error("Server start failed:", error.message);

    if (env.NODE_ENV !== "production") {
      console.error(error);
    }

    process.exit(1);
  }
}

startServer();