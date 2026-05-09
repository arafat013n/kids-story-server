"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { env } = require("../config/env");

function ensureStorageFolders() {
  try {
    if (!fs.existsSync(env.DATA_DIR)) {
      fs.mkdirSync(env.DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(env.AUDIO_DIR)) {
      fs.mkdirSync(env.AUDIO_DIR, { recursive: true });
    }
  } catch (error) {
    throw new Error("Storage folders could not be created: " + error.message);
  }
}

function normalizeBaseUrl(baseUrl) {
  const url = String(baseUrl || env.BASE_URL || "").trim();

  if (!url) {
    return "";
  }

  if (url.endsWith("/")) {
    return url.slice(0, -1);
  }

  return url;
}

function normalizeRelativePath(relativePath) {
  let cleanPath = String(relativePath || "").trim();

  if (!cleanPath) {
    return "";
  }

  if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    return cleanPath;
  }

  if (!cleanPath.startsWith("/")) {
    cleanPath = "/" + cleanPath;
  }

  return cleanPath;
}

function buildUrl(relativePath) {
  const cleanPath = normalizeRelativePath(relativePath);

  if (!cleanPath) {
    return "";
  }

  if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
    return cleanPath;
  }

  const cleanBaseUrl = normalizeBaseUrl(env.BASE_URL);

  if (!cleanBaseUrl) {
    return cleanPath;
  }

  return cleanBaseUrl + cleanPath;
}

function getFileExtension(fileName) {
  const ext = path.extname(String(fileName || "")).replace(".", "").toLowerCase();
  return ext;
}

function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== "string") {
    return "";
  }

  let safe = path.basename(fileName.trim());

  safe = safe.replace(/\s+/g, "_");
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, "");
  safe = safe.replace(/\.+/g, ".");
  safe = safe.replace(/^_+/, "");
  safe = safe.replace(/_+$/, "");

  if (safe === "." || safe === "..") {
    return "";
  }

  if (safe.length > 120) {
    const ext = path.extname(safe);
    const name = path.basename(safe, ext).slice(0, 100);
    safe = name + ext;
  }

  return safe;
}

function isAllowedAudioExtension(ext) {
  const cleanExt = String(ext || "").replace(".", "").toLowerCase();

  if (!cleanExt) {
    return false;
  }

  return env.ALLOWED_AUDIO_EXTENSIONS.includes(cleanExt);
}

function isAllowedAudioFile(fileName) {
  const safeName = sanitizeFileName(fileName);
  const ext = getFileExtension(safeName);

  if (!safeName || !ext) {
    return false;
  }

  return isAllowedAudioExtension(ext);
}

function buildStoryAudioFileName(storyId, originalFileName) {
  const cleanStoryId = sanitizeFileName(String(storyId || "").trim());
  const ext = getFileExtension(originalFileName);

  if (!cleanStoryId || !isAllowedAudioExtension(ext)) {
    return "";
  }

  return cleanStoryId + "." + ext;
}

function getAudioPath(fileName) {
  const safeName = sanitizeFileName(fileName);

  if (!safeName) {
    return "";
  }

  return path.join(env.AUDIO_DIR, safeName);
}

function getAudioPublicPath(fileName) {
  const safeName = sanitizeFileName(fileName);

  if (!safeName) {
    return "";
  }

  return "/audio/" + encodeURIComponent(safeName);
}

function getAudioSecurePath(fileName) {
  const safeName = sanitizeFileName(fileName);

  if (!safeName) {
    return "";
  }

  return "/api/main/audio/" + encodeURIComponent(safeName);
}

function fileExists(filePath) {
  try {
    if (!filePath) {
      return false;
    }

    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

function getFileSize(filePath) {
  try {
    if (!fileExists(filePath)) {
      return 0;
    }

    return fs.statSync(filePath).size;
  } catch (error) {
    return 0;
  }
}

function getFileMd5(filePath) {
  try {
    if (!fileExists(filePath)) {
      return "";
    }

    const hash = crypto.createHash("md5");
    const buffer = fs.readFileSync(filePath);

    hash.update(buffer);

    return hash.digest("hex");
  } catch (error) {
    return "";
  }
}

function getAudioInfo(fileName) {
  const safeName = sanitizeFileName(fileName);
  const fullPath = getAudioPath(safeName);

  if (!safeName || !fileExists(fullPath)) {
    return {
      exists: false,
      file_name: safeName,
      path: fullPath,
      size: 0,
      md5: ""
    };
  }

  return {
    exists: true,
    file_name: safeName,
    path: fullPath,
    size: getFileSize(fullPath),
    md5: getFileMd5(fullPath)
  };
}

function getAudioMimeType(fileName) {
  const ext = getFileExtension(fileName);

  if (ext === "mp3") {
    return "audio/mpeg";
  }

  if (ext === "wav") {
    return "audio/wav";
  }

  if (ext === "m4a") {
    return "audio/mp4";
  }

  return "application/octet-stream";
}

function removeFileIfExists(filePath) {
  try {
    if (fileExists(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

function moveFileSafe(sourcePath, targetPath) {
  if (!sourcePath || !targetPath) {
    throw new Error("Source and target path are required");
  }

  if (!fileExists(sourcePath)) {
    throw new Error("Source file not found");
  }

  const targetDir = path.dirname(targetPath);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (fileExists(targetPath)) {
    removeFileIfExists(targetPath);
  }

  fs.renameSync(sourcePath, targetPath);

  return targetPath;
}

module.exports = {
  ensureStorageFolders,
  buildUrl,
  sanitizeFileName,
  getFileExtension,
  isAllowedAudioExtension,
  isAllowedAudioFile,
  buildStoryAudioFileName,
  getAudioPath,
  getAudioPublicPath,
  getAudioSecurePath,
  fileExists,
  getFileSize,
  getFileMd5,
  getAudioInfo,
  getAudioMimeType,
  removeFileIfExists,
  moveFileSafe
};