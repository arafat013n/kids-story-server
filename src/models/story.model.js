"use strict";

const { db } = require("../database/db");
const {
  buildUrl,
  getAudioPublicPath,
  getAudioSecurePath,
  getAudioInfo,
  sanitizeFileName
} = require("../utils/file");

/*
  Main app local stories:
  story_01, story_02, story_03

  Server uploaded stories will start from:
  story_04, story_05, story_06...
*/
const FIRST_SERVER_STORY_NUMBER = 4;

function nowSql() {
  return "CURRENT_TIMESTAMP";
}

function cleanText(value) {
  return String(value || "").trim();
}

function toDbBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue ? 1 : 0;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return 1;
  }

  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return 0;
  }

  return defaultValue ? 1 : 0;
}

function normalizeStoryRow(row) {
  if (!row) {
    return null;
  }

  const fileName = sanitizeFileName(row.file_name || "");
  const audioInfo = getAudioInfo(fileName);

  const publicPath = row.audio_path || getAudioPublicPath(fileName);
  const securePath = getAudioSecurePath(fileName);

  return {
    id: cleanText(row.id),
    story_number: Number(row.story_number || 0),
    title: cleanText(row.title),
    description: cleanText(row.description),
    desc: cleanText(row.description),
    duration: cleanText(row.duration),
    category: cleanText(row.category),
    file_name: fileName,
    audio_path: publicPath,
    audio_url: buildUrl(publicPath),
    secure_audio_path: securePath,
    secure_audio_url: buildUrl(securePath),
    active: Number(row.active || 0) === 1,
    popular: Number(row.popular || 0) === 1,
    file_exists: audioInfo.exists,
    file_size: audioInfo.size,
    file_md5: audioInfo.md5,
    created_at: cleanText(row.created_at),
    updated_at: cleanText(row.updated_at)
  };
}

function formatStoryId(storyNumber) {
  const number = Number(storyNumber || 0);

  if (number < 10) {
    return "story_0" + number;
  }

  return "story_" + number;
}

function getNextStoryNumber() {
  const row = db.get("SELECT COALESCE(MAX(story_number), 0) AS max_number FROM stories;");

  const maxNumber = row ? Number(row.max_number || 0) : 0;

  if (maxNumber < FIRST_SERVER_STORY_NUMBER) {
    return FIRST_SERVER_STORY_NUMBER;
  }

  return maxNumber + 1;
}

function getNextStoryId() {
  const nextNumber = getNextStoryNumber();

  return {
    story_number: nextNumber,
    id: formatStoryId(nextNumber),
    next_id: formatStoryId(nextNumber)
  };
}

function findById(id) {
  const cleanId = cleanText(id);

  if (!cleanId) {
    return null;
  }

  const row = db.get(
    "SELECT * FROM stories WHERE id = " + db.escapeValue(cleanId) + " LIMIT 1;"
  );

  return normalizeStoryRow(row);
}

function findRawById(id) {
  const cleanId = cleanText(id);

  if (!cleanId) {
    return null;
  }

  return db.get(
    "SELECT * FROM stories WHERE id = " + db.escapeValue(cleanId) + " LIMIT 1;"
  );
}

function listAdminStories() {
  const rows = db.all(
    "SELECT * FROM stories ORDER BY story_number ASC, created_at ASC;"
  );

  return rows.map(normalizeStoryRow).filter(function (story) {
    return story !== null;
  });
}

function listActiveStories() {
  const rows = db.all(
    "SELECT * FROM stories WHERE active = 1 ORDER BY story_number ASC, created_at ASC;"
  );

  return rows.map(normalizeStoryRow).filter(function (story) {
    return story !== null;
  });
}

function createStory(input) {
  input = input || {};

  const title = cleanText(input.title);
  const description = cleanText(input.description || input.desc);
  const duration = cleanText(input.duration);
  const category = cleanText(input.category);
  const fileName = sanitizeFileName(input.file_name || "");
  const active = toDbBoolean(input.active, true);
  const popular = toDbBoolean(input.popular, false);

  if (!title) {
    throw new Error("Title is required");
  }

  if (!description) {
    throw new Error("Description is required");
  }

  if (!fileName) {
    throw new Error("Audio file name is required");
  }

  const next = getNextStoryId();
  const storyId = next.id;
  const storyNumber = next.story_number;
  const audioPath = getAudioPublicPath(fileName);

  const existing = findRawById(storyId);

  if (existing) {
    throw new Error("Story id already exists");
  }

  db.run(`
    INSERT INTO stories (
      id,
      story_number,
      title,
      description,
      duration,
      category,
      file_name,
      audio_path,
      active,
      popular,
      created_at,
      updated_at
    ) VALUES (
      ${db.escapeValue(storyId)},
      ${db.escapeValue(storyNumber)},
      ${db.escapeValue(title)},
      ${db.escapeValue(description)},
      ${db.escapeValue(duration)},
      ${db.escapeValue(category)},
      ${db.escapeValue(fileName)},
      ${db.escapeValue(audioPath)},
      ${db.escapeValue(active)},
      ${db.escapeValue(popular)},
      ${nowSql()},
      ${nowSql()}
    );
  `);

  return findById(storyId);
}

function updateStory(id, input) {
  input = input || {};

  const cleanId = cleanText(id);

  if (!cleanId) {
    throw new Error("Story id is required");
  }

  const existing = findRawById(cleanId);

  if (!existing) {
    return null;
  }

  const updates = [];

  if (input.title !== undefined) {
    const title = cleanText(input.title);

    if (!title) {
      throw new Error("Title cannot be empty");
    }

    updates.push("title = " + db.escapeValue(title));
  }

  if (input.description !== undefined || input.desc !== undefined) {
    const description = cleanText(
      input.description !== undefined ? input.description : input.desc
    );

    if (!description) {
      throw new Error("Description cannot be empty");
    }

    updates.push("description = " + db.escapeValue(description));
  }

  if (input.duration !== undefined) {
    updates.push("duration = " + db.escapeValue(cleanText(input.duration)));
  }

  if (input.category !== undefined) {
    updates.push("category = " + db.escapeValue(cleanText(input.category)));
  }

  if (input.active !== undefined) {
    updates.push("active = " + db.escapeValue(toDbBoolean(input.active, true)));
  }

  if (input.popular !== undefined) {
    updates.push("popular = " + db.escapeValue(toDbBoolean(input.popular, false)));
  }

  if (updates.length === 0) {
    return findById(cleanId);
  }

  updates.push("updated_at = " + nowSql());

  db.run(`
    UPDATE stories
    SET ${updates.join(", ")}
    WHERE id = ${db.escapeValue(cleanId)};
  `);

  return findById(cleanId);
}

function updateStoryAudio(id, fileName) {
  const cleanId = cleanText(id);
  const safeFileName = sanitizeFileName(fileName || "");

  if (!cleanId) {
    throw new Error("Story id is required");
  }

  if (!safeFileName) {
    throw new Error("Audio file name is required");
  }

  const existing = findRawById(cleanId);

  if (!existing) {
    return null;
  }

  const audioPath = getAudioPublicPath(safeFileName);

  db.run(`
    UPDATE stories
    SET
      file_name = ${db.escapeValue(safeFileName)},
      audio_path = ${db.escapeValue(audioPath)},
      updated_at = ${nowSql()}
    WHERE id = ${db.escapeValue(cleanId)};
  `);

  return findById(cleanId);
}

function softDeleteStory(id) {
  const cleanId = cleanText(id);

  if (!cleanId) {
    throw new Error("Story id is required");
  }

  const existing = findRawById(cleanId);

  if (!existing) {
    return null;
  }

  db.run(`
    UPDATE stories
    SET
      active = 0,
      updated_at = ${nowSql()}
    WHERE id = ${db.escapeValue(cleanId)};
  `);

  return findById(cleanId);
}

function hardDeleteStory(id) {
  const cleanId = cleanText(id);

  if (!cleanId) {
    throw new Error("Story id is required");
  }

  const existing = findRawById(cleanId);

  if (!existing) {
    return null;
  }

  db.run("DELETE FROM stories WHERE id = " + db.escapeValue(cleanId) + ";");

  return normalizeStoryRow(existing);
}

function logTokenIssue(input) {
  input = input || {};

  const appType = cleanText(input.app_type);
  const deviceId = cleanText(input.device_id);
  const packageName = cleanText(input.package_name);
  const ipAddress = cleanText(input.ip_address);
  const userAgent = cleanText(input.user_agent);

  if (!appType || !deviceId || !packageName) {
    return;
  }

  db.run(`
    INSERT INTO token_logs (
      app_type,
      device_id,
      package_name,
      ip_address,
      user_agent,
      created_at
    ) VALUES (
      ${db.escapeValue(appType)},
      ${db.escapeValue(deviceId)},
      ${db.escapeValue(packageName)},
      ${db.escapeValue(ipAddress)},
      ${db.escapeValue(userAgent)},
      ${nowSql()}
    );
  `);
}

function logUpload(input) {
  input = input || {};

  const storyId = cleanText(input.story_id);
  const fileName = sanitizeFileName(input.file_name || "");
  const fileSize = Number(input.file_size || 0);
  const fileMd5 = cleanText(input.file_md5);
  const deviceId = cleanText(input.uploaded_by_device_id);

  if (!fileName) {
    return;
  }

  db.run(`
    INSERT INTO upload_logs (
      story_id,
      file_name,
      file_size,
      file_md5,
      uploaded_by_device_id,
      created_at
    ) VALUES (
      ${db.escapeValue(storyId)},
      ${db.escapeValue(fileName)},
      ${db.escapeValue(Number.isFinite(fileSize) ? fileSize : 0)},
      ${db.escapeValue(fileMd5)},
      ${db.escapeValue(deviceId)},
      ${nowSql()}
    );
  `);
}

function logAdminAction(input) {
  input = input || {};

  const action = cleanText(input.action);
  const storyId = cleanText(input.story_id);
  const deviceId = cleanText(input.device_id);
  const detail = cleanText(input.detail);

  if (!action) {
    return;
  }

  db.run(`
    INSERT INTO admin_action_logs (
      action,
      story_id,
      device_id,
      detail,
      created_at
    ) VALUES (
      ${db.escapeValue(action)},
      ${db.escapeValue(storyId)},
      ${db.escapeValue(deviceId)},
      ${db.escapeValue(detail)},
      ${nowSql()}
    );
  `);
}

module.exports = {
  normalizeStoryRow,
  formatStoryId,
  getNextStoryNumber,
  getNextStoryId,
  findById,
  findRawById,
  listAdminStories,
  listActiveStories,
  createStory,
  updateStory,
  updateStoryAudio,
  softDeleteStory,
  hardDeleteStory,
  logTokenIssue,
  logUpload,
  logAdminAction
};
