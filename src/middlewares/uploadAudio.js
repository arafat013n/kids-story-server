"use strict";

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const { env } = require("../config/env");
const {
  ensureStorageFolders,
  sanitizeFileName,
  isAllowedAudioFile
} = require("../utils/file");
const { validationError } = require("../utils/response");

ensureStorageFolders();

const tempUploadDir = path.join(env.DATA_DIR, "tmp_uploads");

function ensureTempUploadFolder() {
  try {
    ensureStorageFolders();

    if (!fs.existsSync(tempUploadDir)) {
      fs.mkdirSync(tempUploadDir, { recursive: true });
    }
  } catch (error) {
    throw new Error("Upload folder create failed");
  }
}

ensureTempUploadFolder();

function removeUploadedFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {}
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    try {
      ensureTempUploadFolder();
      cb(null, tempUploadDir);
    } catch (error) {
      cb(error);
    }
  },

  filename: function (req, file, cb) {
    try {
      const originalName = sanitizeFileName(file.originalname || "");
      const ext = path.extname(originalName).toLowerCase();

      if (!originalName || !isAllowedAudioFile(originalName)) {
        return cb(new Error("Only mp3, wav, or m4a audio files are allowed"));
      }

      const tempName =
        "upload_" +
        Date.now() +
        "_" +
        Math.random().toString(16).slice(2) +
        ext;

      return cb(null, tempName);
    } catch (error) {
      return cb(new Error("Audio upload filename create failed"));
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: Number(env.MAX_AUDIO_UPLOAD_MB || 100) * 1024 * 1024,
    files: 1
  },
  fileFilter: function (req, file, cb) {
    try {
      const originalName = sanitizeFileName(file.originalname || "");

      if (!originalName || !isAllowedAudioFile(originalName)) {
        return cb(new Error("Only mp3, wav, or m4a audio files are allowed"));
      }

      return cb(null, true);
    } catch (error) {
      return cb(new Error("Audio file validation failed"));
    }
  }
});

function uploadSingleAudio(req, res, next) {
  const handler = upload.single("audio");

  handler(req, res, function (error) {
    if (error) {
      if (req.file && req.file.path) {
        removeUploadedFile(req.file.path);
      }

      if (error.code === "LIMIT_FILE_SIZE") {
        return validationError(
          res,
          "Audio file is too large. Maximum allowed size is " + env.MAX_AUDIO_UPLOAD_MB + "MB"
        );
      }

      return validationError(res, error.message || "Audio upload failed");
    }

    if (!req.file) {
      return validationError(res, "Audio file is required");
    }

    return next();
  });
}

module.exports = {
  uploadSingleAudio
};