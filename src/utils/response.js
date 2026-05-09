"use strict";

function success(res, data, statusCode) {
  const code = statusCode || 200;

  return res.status(code).json({
    success: true,
    ...data
  });
}

function error(res, statusCode, message, extra) {
  const code = statusCode || 500;

  const response = {
    success: false,
    error: message || "Something went wrong"
  };

  if (extra && typeof extra === "object") {
    Object.assign(response, extra);
  }

  return res.status(code).json(response);
}

function validationError(res, message, extra) {
  return error(res, 400, message || "Validation failed", extra);
}

function unauthorized(res, message, extra) {
  return error(res, 401, message || "Unauthorized", extra);
}

function forbidden(res, message, extra) {
  return error(res, 403, message || "Forbidden", extra);
}

function notFound(res, message, extra) {
  return error(res, 404, message || "Not found", extra);
}

function conflict(res, message, extra) {
  return error(res, 409, message || "Conflict", extra);
}

function serverError(res, message, extra) {
  return error(res, 500, message || "Internal server error", extra);
}

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = {
  success,
  error,
  validationError,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
  asyncHandler
};