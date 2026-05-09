"use strict";

const { env } = require("../config/env");
const { unauthorized } = require("../utils/response");
const { getBearerToken, verifyToken } = require("../utils/token");

function authMainApp(req, res, next) {
  try {
    const token = getBearerToken(req);
    const deviceId = String(
      req.headers["x-device-id"] || req.headers["x-app-device-id"] || ""
    ).trim();

    if (!token) {
      return unauthorized(res, "Main app token missing");
    }

    if (!deviceId) {
      return unauthorized(res, "Device id missing");
    }

    const payload = verifyToken(token, env.MAIN_SERVER_SECRET);

    if (!payload) {
      return unauthorized(res, "Invalid or expired main app token");
    }

    if (payload.type !== "main") {
      return unauthorized(res, "Invalid token type");
    }

    if (payload.device_id !== deviceId) {
      return unauthorized(res, "Device id mismatch");
    }

    if (payload.package_name !== env.MAIN_PACKAGE_NAME) {
      return unauthorized(res, "Package name mismatch");
    }

    req.mainApp = {
      device_id: deviceId,
      package_name: payload.package_name
    };

    return next();
  } catch (error) {
    return unauthorized(res, "Main app authentication failed");
  }
}

module.exports = {
  authMainApp
};