"use strict";

const fs = require("fs");
const path = require("path");

const { env } = require("../config/env");
const { success, forbidden, notFound, serverError } = require("../utils/response");

const {
  buildUrl,
  getAudioPath,
  getAudioMimeType,
  sanitizeFileName,
  isAllowedAudioFile
} = require("../utils/file");

const StoryModel = require("../models/story.model");

function safeAudioPath(audioPath) {
  try {
    const resolvedAudioPath = path.resolve(audioPath);
    const resolvedAudioDir = path.resolve(env.AUDIO_DIR);

    return (
      resolvedAudioPath !== resolvedAudioDir &&
      resolvedAudioPath.startsWith(resolvedAudioDir + path.sep)
    );
  } catch (error) {
    return false;
  }
}

function home(req, res) {
  return success(res, {
    message: "Kids Audio Story Secure MVC Server is running",
    version: "3.0.0",
    env: env.NODE_ENV,
    public_stories_enabled: env.PUBLIC_STORIES_ENABLED,
    public_audio_enabled: env.PUBLIC_AUDIO_ENABLED
  });
}

function health(req, res) {
  return success(res, {
    status: "healthy",
    server_time: new Date().toISOString(),
    env: env.NODE_ENV,
    public_stories_enabled: env.PUBLIC_STORIES_ENABLED,
    public_audio_enabled: env.PUBLIC_AUDIO_ENABLED
  });
}

function publicStories(req, res) {
  try {
    if (!env.PUBLIC_STORIES_ENABLED) {
      return forbidden(res, "Public stories API is disabled");
    }

    const stories = StoryModel.listActiveStories().map(function (story) {
      const fileName = sanitizeFileName(story.file_name || "");

      return {
        id: story.id,
        story_number: story.story_number,
        title: story.title,
        description: story.description,
        desc: story.description,
        duration: story.duration,
        category: story.category,
        file_name: fileName,
        audio_url: buildUrl("/audio/" + encodeURIComponent(fileName)),
        auto_download: false,
        popular: story.popular,
        active: story.active,
        file_exists: story.file_exists,
        file_size: story.file_size
      };
    });

    return success(res, {
      total: stories.length,
      stories: stories
    });
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Public stories error:", error.message);
    }

    return serverError(res, "Could not load public stories");
  }
}

function publicAudio(req, res) {
  try {
    if (!env.PUBLIC_AUDIO_ENABLED) {
      return forbidden(res, "Public audio access is disabled");
    }

    const fileName = sanitizeFileName(req.params.fileName || "");

    if (!fileName || !isAllowedAudioFile(fileName)) {
      return notFound(res, "Audio file not found");
    }

    const audioPath = getAudioPath(fileName);

    if (!audioPath || !fs.existsSync(audioPath)) {
      return notFound(res, "Audio file not found");
    }

    if (!safeAudioPath(audioPath)) {
      return forbidden(res, "Invalid audio path");
    }

    const resolvedAudioPath = path.resolve(audioPath);
    const stat = fs.statSync(resolvedAudioPath);
    const fileSize = stat.size;
    const mimeType = getAudioMimeType(fileName);
    const range = req.headers.range;

    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.setHeader("Content-Disposition", 'inline; filename="' + fileName.replace(/"/g, "") + '"');

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

      stream.on("error", function () {
        if (!res.headersSent) {
          return serverError(res, "Public audio stream failed");
        }

        res.end();
      });

      return stream.pipe(res);
    }

    res.setHeader("Content-Length", fileSize);

    const stream = fs.createReadStream(resolvedAudioPath);

    stream.on("error", function () {
      if (!res.headersSent) {
        return serverError(res, "Public audio stream failed");
      }

      res.end();
    });

    return stream.pipe(res);
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Public audio error:", error.message);
    }

    return serverError(res, "Public audio request failed");
  }
}

module.exports = {
  home,
  health,
  publicStories,
  publicAudio
};