"use strict";

const fs = require("fs");
const path = require("path");

const { env } = require("../config/env");

const {
  success,
  validationError,
  forbidden,
  notFound,
  conflict,
  serverError
} = require("../utils/response");

const { createAdminToken } = require("../utils/token");

const {
  sanitizeFileName,
  getFileExtension,
  buildStoryAudioFileName,
  getAudioPath,
  getAudioInfo,
  moveFileSafe,
  removeFileIfExists,
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

function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return defaultValue;
}

function getAdminDeviceId(req) {
  try {
    if (req.admin && req.admin.device_id) {
      return String(req.admin.device_id || "").trim();
    }

    return String(req.headers["x-admin-device-id"] || "").trim();
  } catch (error) {
    return "";
  }
}

function safeRemoveUploadFile(req) {
  try {
    if (req && req.file && req.file.path) {
      removeFileIfExists(req.file.path);
    }
  } catch (error) {}
}

function validateResolvedAudioPath(audioPath) {
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

function adminLogin(req, res) {
  try {
    const body = req.body || {};

    const deviceId = cleanText(body.device_id);
    const adminAppKey = cleanText(body.admin_app_key || body.app_key);
    const adminSecret = cleanText(body.admin_secret || body.secret);
    const packageName = cleanText(body.package_name);

    if (!deviceId) {
      return validationError(res, "device_id is required");
    }

    if (!adminAppKey) {
      return validationError(res, "admin_app_key is required");
    }

    if (!adminSecret) {
      return validationError(res, "admin_secret is required");
    }

    if (!packageName) {
      return validationError(res, "package_name is required");
    }

    if (adminAppKey !== env.ADMIN_APP_KEY) {
      return forbidden(res, "Invalid admin app key");
    }

    if (adminSecret !== env.ADMIN_LOGIN_SECRET) {
      return forbidden(res, "Invalid admin secret");
    }

    if (packageName !== env.ADMIN_PACKAGE_NAME) {
      return forbidden(res, "Invalid admin package name");
    }

    const token = createAdminToken({
      device_id: deviceId,
      package_name: packageName,
      secret: env.ADMIN_SERVER_SECRET,
      expire_hours: env.ADMIN_TOKEN_EXPIRE_HOURS
    });

    try {
      StoryModel.logTokenIssue({
        app_type: "admin",
        device_id: deviceId,
        package_name: packageName,
        ip_address: getClientIp(req),
        user_agent: String(req.headers["user-agent"] || "")
      });
    } catch (logError) {}

    return success(res, {
      token: token,
      token_type: "Bearer",
      device_id: deviceId,
      expire_hours: env.ADMIN_TOKEN_EXPIRE_HOURS
    });
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Admin login error:", error.message);
    }

    return serverError(res, "Admin login failed");
  }
}

function listAdminStories(req, res) {
  try {
    const stories = StoryModel.listAdminStories();

    return success(res, {
      total: stories.length,
      stories: stories
    });
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Admin stories error:", error.message);
    }

    return serverError(res, "Could not load admin stories");
  }
}

function getNextStoryId(req, res) {
  try {
    const next = StoryModel.getNextStoryId();

    return success(res, {
      story_number: next.story_number,
      id: next.id,
      next_id: next.id
    });
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Next story id error:", error.message);
    }

    return serverError(res, "Could not generate next story id");
  }
}

function createStoryWithAudio(req, res) {
  let createdStory = null;
  let finalAudioPath = "";
  let tempFilePath = "";

  try {
    const body = req.body || {};

    const title = cleanText(body.title);
    const description = cleanText(body.description || body.desc);
    const duration = cleanText(body.duration);
    const category = cleanText(body.category);
    const popular = toBoolean(body.popular, false);
    const active = toBoolean(body.active, true);

    if (!title) {
      safeRemoveUploadFile(req);
      return validationError(res, "Title is required");
    }

    if (!description) {
      safeRemoveUploadFile(req);
      return validationError(res, "Description is required");
    }

    if (!req.file) {
      return validationError(res, "Audio file is required");
    }

    const originalFileName = sanitizeFileName(req.file.originalname || "");
    const tempFileName = sanitizeFileName(req.file.filename || "");
    tempFilePath = req.file.path || "";

    if (!originalFileName || !isAllowedAudioFile(originalFileName)) {
      removeFileIfExists(tempFilePath);
      return validationError(res, "Only mp3, wav, or m4a audio files are allowed");
    }

    if (!tempFileName || !tempFilePath || !fs.existsSync(tempFilePath)) {
      removeFileIfExists(tempFilePath);
      return validationError(res, "Uploaded audio file was not received");
    }

    const ext = getFileExtension(originalFileName);

    if (!ext) {
      removeFileIfExists(tempFilePath);
      return validationError(res, "Audio extension is missing");
    }

    createdStory = StoryModel.createStory({
      title: title,
      description: description,
      duration: duration,
      category: category,
      file_name: tempFileName,
      active: active,
      popular: popular
    });

    if (!createdStory || !createdStory.id) {
      removeFileIfExists(tempFilePath);
      return serverError(res, "Story database record could not be created");
    }

    const finalFileName = buildStoryAudioFileName(createdStory.id, originalFileName);

    if (!finalFileName) {
      StoryModel.softDeleteStory(createdStory.id);
      removeFileIfExists(tempFilePath);
      return validationError(res, "Could not create safe audio file name");
    }

    finalAudioPath = getAudioPath(finalFileName);

    if (!validateResolvedAudioPath(finalAudioPath)) {
      StoryModel.softDeleteStory(createdStory.id);
      removeFileIfExists(tempFilePath);
      return forbidden(res, "Invalid audio path");
    }

    moveFileSafe(tempFilePath, finalAudioPath);
    tempFilePath = "";

    const updatedStory = StoryModel.updateStoryAudio(createdStory.id, finalFileName);
    const audioInfo = getAudioInfo(finalFileName);

    try {
      StoryModel.logUpload({
        story_id: createdStory.id,
        file_name: finalFileName,
        file_size: audioInfo.size,
        file_md5: audioInfo.md5,
        uploaded_by_device_id: getAdminDeviceId(req)
      });
    } catch (logError) {}

    try {
      StoryModel.logAdminAction({
        action: "story_create",
        story_id: createdStory.id,
        device_id: getAdminDeviceId(req),
        detail: "Story created with audio upload"
      });
    } catch (logError) {}

    return success(
      res,
      {
        message: "Story created successfully",
        story: updatedStory
      },
      201
    );
  } catch (error) {
    if (tempFilePath) {
      removeFileIfExists(tempFilePath);
    }

    if (finalAudioPath) {
      removeFileIfExists(finalAudioPath);
    }

    if (createdStory && createdStory.id) {
      try {
        StoryModel.softDeleteStory(createdStory.id);
      } catch (cleanupError) {}
    }

    if (String(error.message || "").toLowerCase().includes("unique")) {
      return conflict(res, "Story already exists");
    }

    if (env.NODE_ENV !== "production") {
      console.error("Create story error:", error.message);
    }

    return serverError(res, "Story create failed", {
      detail: env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

function updateStory(req, res) {
  try {
    const storyId = cleanText(req.params.id);

    if (!storyId) {
      return validationError(res, "Story id is required");
    }

    const existingStory = StoryModel.findById(storyId);

    if (!existingStory) {
      return notFound(res, "Story not found");
    }

    const body = req.body || {};

    const input = {};

    if (body.title !== undefined) {
      input.title = body.title;
    }

    if (body.description !== undefined) {
      input.description = body.description;
    }

    if (body.desc !== undefined) {
      input.desc = body.desc;
    }

    if (body.duration !== undefined) {
      input.duration = body.duration;
    }

    if (body.category !== undefined) {
      input.category = body.category;
    }

    if (body.active !== undefined) {
      input.active = toBoolean(body.active, true);
    }

    if (body.popular !== undefined) {
      input.popular = toBoolean(body.popular, false);
    }

    const updatedStory = StoryModel.updateStory(storyId, input);

    if (!updatedStory) {
      return notFound(res, "Story not found");
    }

    try {
      StoryModel.logAdminAction({
        action: "story_update",
        story_id: storyId,
        device_id: getAdminDeviceId(req),
        detail: "Story metadata/status updated"
      });
    } catch (logError) {}

    return success(res, {
      message: "Story updated successfully",
      story: updatedStory
    });
  } catch (error) {
    return validationError(res, error.message || "Story update failed");
  }
}

function replaceStoryAudio(req, res) {
  let tempFilePath = "";
  let finalAudioPath = "";

  try {
    const storyId = cleanText(req.params.id);

    if (!storyId) {
      safeRemoveUploadFile(req);
      return validationError(res, "Story id is required");
    }

    const existingStory = StoryModel.findById(storyId);

    if (!existingStory) {
      safeRemoveUploadFile(req);
      return notFound(res, "Story not found");
    }

    if (!req.file) {
      return validationError(res, "Audio file is required");
    }

    const originalFileName = sanitizeFileName(req.file.originalname || "");
    tempFilePath = req.file.path || "";

    if (!originalFileName || !isAllowedAudioFile(originalFileName)) {
      removeFileIfExists(tempFilePath);
      return validationError(res, "Only mp3, wav, or m4a audio files are allowed");
    }

    if (!tempFilePath || !fs.existsSync(tempFilePath)) {
      removeFileIfExists(tempFilePath);
      return validationError(res, "Uploaded audio file was not received");
    }

    const finalFileName = buildStoryAudioFileName(storyId, originalFileName);

    if (!finalFileName) {
      removeFileIfExists(tempFilePath);
      return validationError(res, "Could not create safe audio file name");
    }

    const oldAudioPath = getAudioPath(existingStory.file_name);
    finalAudioPath = getAudioPath(finalFileName);

    if (!validateResolvedAudioPath(finalAudioPath)) {
      removeFileIfExists(tempFilePath);
      return forbidden(res, "Invalid audio path");
    }

    moveFileSafe(tempFilePath, finalAudioPath);
    tempFilePath = "";

    if (oldAudioPath && oldAudioPath !== finalAudioPath) {
      removeFileIfExists(oldAudioPath);
    }

    const updatedStory = StoryModel.updateStoryAudio(storyId, finalFileName);
    const audioInfo = getAudioInfo(finalFileName);

    try {
      StoryModel.logUpload({
        story_id: storyId,
        file_name: finalFileName,
        file_size: audioInfo.size,
        file_md5: audioInfo.md5,
        uploaded_by_device_id: getAdminDeviceId(req)
      });
    } catch (logError) {}

    try {
      StoryModel.logAdminAction({
        action: "story_audio_replace",
        story_id: storyId,
        device_id: getAdminDeviceId(req),
        detail: "Story audio replaced"
      });
    } catch (logError) {}

    return success(res, {
      message: "Story audio replaced successfully",
      story: updatedStory
    });
  } catch (error) {
    if (tempFilePath) {
      removeFileIfExists(tempFilePath);
    }

    if (env.NODE_ENV !== "production") {
      console.error("Replace audio error:", error.message);
    }

    return serverError(res, "Story audio replace failed", {
      detail: env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

function deleteStory(req, res) {
  try {
    const storyId = cleanText(req.params.id);

    if (!storyId) {
      return validationError(res, "Story id is required");
    }

    const deletedStory = StoryModel.softDeleteStory(storyId);

    if (!deletedStory) {
      return notFound(res, "Story not found");
    }

    try {
      StoryModel.logAdminAction({
        action: "story_soft_delete",
        story_id: storyId,
        device_id: getAdminDeviceId(req),
        detail: "Story deactivated"
      });
    } catch (logError) {}

    return success(res, {
      message: "Story deleted successfully",
      story: deletedStory
    });
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Delete story error:", error.message);
    }

    return serverError(res, "Story delete failed");
  }
}

function hardDeleteStory(req, res) {
  try {
    const storyId = cleanText(req.params.id);

    if (!storyId) {
      return validationError(res, "Story id is required");
    }

    const existingStory = StoryModel.findById(storyId);

    if (!existingStory) {
      return notFound(res, "Story not found");
    }

    const deletedStory = StoryModel.hardDeleteStory(storyId);

    if (!deletedStory) {
      return notFound(res, "Story not found");
    }

    const audioPath = getAudioPath(existingStory.file_name);

    if (audioPath && validateResolvedAudioPath(audioPath)) {
      removeFileIfExists(audioPath);
    }

    try {
      StoryModel.logAdminAction({
        action: "story_hard_delete",
        story_id: storyId,
        device_id: getAdminDeviceId(req),
        detail: "Story and audio permanently deleted"
      });
    } catch (logError) {}

    return success(res, {
      message: "Story permanently deleted successfully",
      story: deletedStory
    });
  } catch (error) {
    if (env.NODE_ENV !== "production") {
      console.error("Hard delete story error:", error.message);
    }

    return serverError(res, "Story hard delete failed");
  }
}

module.exports = {
  adminLogin,
  listAdminStories,
  getNextStoryId,
  createStoryWithAudio,
  updateStory,
  replaceStoryAudio,
  deleteStory,
  hardDeleteStory
};