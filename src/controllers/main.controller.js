"use strict";

const fs = require("fs");
const path = require("path");

const { env } = require("../config/env");
const {
  success,
  validationError,
  forbidden,
  notFound,
  serverError
} = require("../utils/response");

const { createMainAppToken } = require("../utils/token");

const {
  buildUrl,
  getAudioPath,
  getAudioMimeType,
  sanitizeFileName,
  isAllowedAudioFile
} = require("../utils/file");

const StoryModel = require("../models/story.model");

function getClientIp(req) {
  try {
    const forwardedFor = String(req.headers["x-forwarded-for"] || "").trim();

    if (forwardedFor.length > 0) {
      return forwardedFor.split(",")[0].trim();
    }

    return String(req.ip || req.socket.remoteAddress || "").trim();
  } catch (error) {
    return "";
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function issueMainToken(req, res) {
  try {
    const body = req.body || {};

    const deviceId = cleanText(body.device_id);
    const appKey = cleanText(body.app_key || body.main_app_key);
    const packageName = cleanText(body.package_name);

    if (!deviceId) {
      return validationError(res, "device_id is required");
    }

    if (!appKey) {
      return validationError(res, "app_key is required");
    }

    if (!packageName) {
      return validationError(res, "package_name is required");
    }

    if (appKey !== env.MAIN_APP_KEY) {
      return forbidden(res, "Invalid main app key");
    }

    if (packageName !== env.MAIN_PACKAGE_NAME) {
      return forbidden(res, "Invalid main package name");
    }

    const token = createMainAppToken({
      device_id: deviceId,
      package_name: packageName,
      secret: env.MAIN_SERVER_SECRET,
      expire_hours: env.MAIN_TOKEN_EXPIRE_HOURS
    });

    try {
      StoryModel.logTokenIssue({
        app_type: "main",
        device_id: deviceId,
        package_name: packageName,
        ip_address: getClientIp(req),
        user_agent: String(req.headers["user-agent"] || "")
      });
    } catch (logError) {
      console.error(
        "MAIN_TOKEN_LOG_ERROR:",
        logError && logError.stack ? logError.stack : logError
      );
    }

    return success(res, {
      token: token,
      token_type: "Bearer",
      device_id: deviceId,
      expire_hours: env.MAIN_TOKEN_EXPIRE_HOURS
    });
  } catch (error) {
    console.error(
      "MAIN_TOKEN_CREATE_ERROR:",
      error && error.stack ? error.stack : error
    );

    return serverError(res, "Main app token create failed");
  }
}

function listMainStories(req, res) {
  try {
    const stories = StoryModel.listActiveStories()
      .filter(function (story) {
        return story && story.active === true;
      })
      .map(function (story) {
        const fileName = sanitizeFileName(story.file_name || "");

        return {
          id: cleanText(story.id),
          story_number: Number(story.story_number || 0),
          title: cleanText(story.title),
          description: cleanText(story.description || story.desc),
          desc: cleanText(story.description || story.desc),
          duration: cleanText(story.duration),
          category: cleanText(story.category),
          file_name: fileName,
          audio_path: cleanText(story.audio_path),
          audio_url: buildUrl("/api/main/audio/" + encodeURIComponent(fileName)),
          secure_audio_url: buildUrl("/api/main/audio/" + encodeURIComponent(fileName)),
          auto_download: false,
          popular: story.popular === true,
          active: story.active === true,
          file_exists: story.file_exists === true,
          file_size: Number(story.file_size || 0)
        };
      });

    return success(res, {
      total: stories.length,
      stories: stories
    });
  } catch (error) {
    console.error(
      "MAIN_STORIES_ERROR:",
      error && error.stack ? error.stack : error
    );

    return serverError(res, "Could not load main app stories");
  }
}

function streamMainAudio(req, res) {
  try {
    const fileName = sanitizeFileName(req.params.fileName || "");

    if (!fileName || !isAllowedAudioFile(fileName)) {
      return notFound(res, "Audio file not found");
    }

    const audioPath = getAudioPath(fileName);

    if (!audioPath || !fs.existsSync(audioPath)) {
      return notFound(res, "Audio file not found");
    }

    const resolvedAudioPath = path.resolve(audioPath);
    const resolvedAudioDir = path.resolve(env.AUDIO_DIR);

    if (
      resolvedAudioPath === resolvedAudioDir ||
      !resolvedAudioPath.startsWith(resolvedAudioDir + path.sep)
    ) {
      return forbidden(res, "Invalid audio path");
    }

    const stat = fs.statSync(resolvedAudioPath);
    const fileSize = stat.size;
    const mimeType = getAudioMimeType(fileName);
    const range = req.headers.range;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader(
      "Content-Disposition",
      'inline; filename="' + fileName.replace(/"/g, "") + '"'
    );

    if (range) {
      const parts = String(range).replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end >= fileSize ||
        start > end
      ) {
        res.setHeader("Content-Range", "bytes */" + fileSize);
        return res.status(416).end();
      }

      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
      res.setHeader("Content-Length", chunkSize);

      const stream = fs.createReadStream(resolvedAudioPath, {
        start: start,
        end: end
      });

      stream.on("error", function (streamError) {
        console.error(
          "MAIN_AUDIO_STREAM_ERROR:",
          streamError && streamError.stack ? streamError.stack : streamError
        );

        if (!res.headersSent) {
          return serverError(res, "Audio stream failed");
        }

        res.end();
      });

      return stream.pipe(res);
    }

    res.setHeader("Content-Length", fileSize);

    const stream = fs.createReadStream(resolvedAudioPath);

    stream.on("error", function (streamError) {
      console.error(
        "MAIN_AUDIO_STREAM_ERROR:",
        streamError && streamError.stack ? streamError.stack : streamError
      );

      if (!res.headersSent) {
        return serverError(res, "Audio stream failed");
      }

      res.end();
    });

    return stream.pipe(res);
  } catch (error) {
    console.error(
      "MAIN_AUDIO_ERROR:",
      error && error.stack ? error.stack : error
    );

    return serverError(res, "Secure audio request failed");
  }
}

module.exports = {
  issueMainToken,
  listMainStories,
  streamMainAudio
};
