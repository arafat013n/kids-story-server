"use strict";

const { env } = require("../config/env");
const { unauthorized } = require("../utils/response");
const { getBearerToken, verifyToken } = require("../utils/token");

function authAdmin(req, res, next) {
  try {
    const token = getBearerToken(req);
    const deviceId = String(req.headers["x-admin-device-id"] || "").trim();

    if (!token) {
      return unauthorized(res, "Admin token missing");
    }

    if (!deviceId) {
      return unauthorized(res, "Admin device id missing");
    }

    const payload = verifyToken(token, env.ADMIN_SERVER_SECRET);

    if (!payload) {
      return unauthorized(res, "Invalid or expired admin token");
    }

    if (payload.type !== "admin") {
      return unauthorized(res, "Invalid admin token type");
    }

    if (payload.device_id !== deviceId) {
      return unauthorized(res, "Admin device id mismatch");
    }

    if (payload.package_name !== env.ADMIN_PACKAGE_NAME) {
      return unauthorized(res, "Admin package name mismatch");
    }

    req.admin = {
      device_id: deviceId,
      package_name: payload.package_name
    };

    return next();
  } catch (error) {
    return unauthorized(res, "Admin authentication failed");
  }
}

module.exports = {
  authAdmin
};