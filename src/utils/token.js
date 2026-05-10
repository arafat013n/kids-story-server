"use strict";

const crypto = require("crypto");

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function createToken(payload, secret, expireHours) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Token payload must be an object");
  }

  if (!secret || typeof secret !== "string" || secret.length < 24) {
    throw new Error("Token secret must be at least 24 characters");
  }

  const now = Date.now();
  const hours = Number(expireHours || 24);

  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Token expire hours is invalid");
  }

  const finalPayload = Object.assign({}, payload, {
    iat: now,
    exp: now + hours * 60 * 60 * 1000
  });

  const encodedPayload = base64UrlEncode(JSON.stringify(finalPayload));

  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64url");

  return encodedPayload + "." + signature;
}

function verifyToken(token, secret) {
  try {
    if (!token || typeof token !== "string") {
      return null;
    }

    if (!secret || typeof secret !== "string" || secret.length < 24) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 2) {
      return null;
    }

    const encodedPayload = String(parts[0] || "").trim();
    const signature = String(parts[1] || "").trim();

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));

    if (!payload || typeof payload !== "object") {
      return null;
    }

    if (!payload.exp || Date.now() > Number(payload.exp)) {
      return null;
    }

    if (!payload.iat || Number(payload.iat) > Date.now() + 60000) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  }
}

function getBearerToken(req) {
  try {
    const authHeader = String(req.headers.authorization || "").trim();

    if (!authHeader) {
      return "";
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2) {
      return "";
    }

    if (parts[0].toLowerCase() !== "bearer") {
      return "";
    }

    return String(parts[1] || "").trim();
  } catch (error) {
    return "";
  }
}

function createMainAppToken(options) {
  options = options || {};

  return createToken(
    {
      type: "main",
      device_id: String(options.device_id || "").trim(),
      package_name: String(options.package_name || "").trim()
    },
    options.secret,
    options.expire_hours
  );
}

function createAdminToken(options) {
  options = options || {};

  return createToken(
    {
      type: "admin",
      device_id: String(options.device_id || "").trim(),
      package_name: String(options.package_name || "").trim()
    },
    options.secret,
    options.expire_hours
  );
}

function maskToken(token) {
  if (!token || typeof token !== "string") {
    return "";
  }

  if (token.length <= 16) {
    return "********";
  }

  return token.slice(0, 8) + "..." + token.slice(-8);
}

module.exports = {
  createToken,
  verifyToken,
  getBearerToken,
  createMainAppToken,
  createAdminToken,
  maskToken
};
