const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || "";

const audioFolder = path.join(__dirname, "audio");
const storiesFilePath = path.join(__dirname, "stories.json");

// Middleware
app.use(cors());
app.use(express.json());

// Simple request logger
app.use(function (req, res, next) {
  console.log(req.method + " " + req.originalUrl);
  next();
});

// Serve audio files
app.use(
  "/audio",
  express.static(audioFolder, {
    maxAge: "7d",
    etag: true,
    lastModified: true,
    setHeaders: function (res, filePath) {
      res.setHeader("Cache-Control", "public, max-age=604800");

      if (filePath.endsWith(".mp3")) {
        res.setHeader("Content-Type", "audio/mpeg");
      } else if (filePath.endsWith(".wav")) {
        res.setHeader("Content-Type", "audio/wav");
      } else if (filePath.endsWith(".m4a")) {
        res.setHeader("Content-Type", "audio/mp4");
      }
    },
  }),
);

// Build clean base URL
function getCleanBaseUrl() {
  if (!BASE_URL) {
    return "";
  }

  return BASE_URL.replace(/\/$/, "");
}

// Build Android friendly audio URL
function buildAudioUrl(audioPath) {
  if (!audioPath || typeof audioPath !== "string") {
    return "";
  }

  const cleanAudioPath = audioPath.startsWith("/")
    ? audioPath
    : "/" + audioPath;

  if (BASE_URL) {
    return getCleanBaseUrl() + cleanAudioPath;
  }

  return cleanAudioPath;
}

// Safe JSON response helper
function sendError(res, statusCode, message, extra) {
  const response = {
    success: false,
    error: message,
  };

  if (extra && typeof extra === "object") {
    Object.assign(response, extra);
  }

  return res.status(statusCode).json(response);
}

// Read stories.json safely
function readStoriesFile() {
  if (!fs.existsSync(storiesFilePath)) {
    return {
      success: false,
      version: 1,
      stories: [],
      error: "stories.json file not found",
    };
  }

  try {
    const fileData = fs.readFileSync(storiesFilePath, "utf8");

    if (!fileData.trim()) {
      return {
        success: false,
        version: 1,
        stories: [],
        error: "stories.json is empty",
      };
    }

    const jsonData = JSON.parse(fileData);

    if (!jsonData || typeof jsonData !== "object") {
      return {
        success: false,
        version: 1,
        stories: [],
        error: "stories.json root must be an object",
      };
    }

    if (!Array.isArray(jsonData.stories)) {
      return {
        success: false,
        version: jsonData.version || 1,
        stories: [],
        error: "stories field must be an array",
      };
    }

    return {
      success: true,
      version: jsonData.version || 1,
      stories: jsonData.stories,
    };
  } catch (error) {
    return {
      success: false,
      version: 1,
      stories: [],
      error: "Invalid stories.json: " + error.message,
    };
  }
}

// Check audio file exists
function audioFileExists(fileName) {
  if (!fileName || typeof fileName !== "string") {
    return false;
  }

  const safeFileName = path.basename(fileName);
  const fullPath = path.join(audioFolder, safeFileName);

  return fs.existsSync(fullPath);
}

// Validate one story object
function isValidStory(story) {
  if (!story || typeof story !== "object") {
    return false;
  }

  if (!story.id || typeof story.id !== "string") {
    return false;
  }

  if (!story.title || typeof story.title !== "string") {
    return false;
  }

  if (!story.file_name || typeof story.file_name !== "string") {
    return false;
  }

  if (!story.audio_path || typeof story.audio_path !== "string") {
    return false;
  }

  return true;
}

// Convert story object for Android app
function buildStoryResponse(story) {
  return {
    id: story.id || "",
    title: story.title || "",
    desc: story.desc || "",
    duration: story.duration || "",
    category: story.category || "",
    file_name: story.file_name || "",
    audio_url: buildAudioUrl(story.audio_path || ""),
    auto_download: story.auto_download === true,
    popular: story.popular === true,
    active: story.active === true,
  };
}

// GET /
app.get("/", function (req, res) {
  return res.json({
    success: true,
    message: "Kids Audio Story Server is running",
    app_name: "Kids Audio Story App",
    package_name: "com.akash.kidsaudiostory",
    version: 1,
  });
});

// GET /health
app.get("/health", function (req, res) {
  const storiesData = readStoriesFile();

  return res.json({
    success: true,
    status: "healthy",
    server_time: new Date().toISOString(),
    stories_json: storiesData.success ? "ok" : "error",
    audio_folder: fs.existsSync(audioFolder) ? "ok" : "missing",
  });
});

// GET /stories
app.get("/stories", function (req, res) {
  const data = readStoriesFile();

  if (!data.success) {
    return sendError(res, 500, data.error || "Could not load stories", {
      version: data.version || 1,
      stories: [],
    });
  }

  const activeStories = [];

  data.stories.forEach(function (story) {
    if (story.active !== true) {
      return;
    }

    if (!isValidStory(story)) {
      return;
    }

    activeStories.push(buildStoryResponse(story));
  });

  return res.json({
    success: true,
    version: data.version || 1,
    total: activeStories.length,
    stories: activeStories,
  });
});

// GET /stories/debug
// Local/server check করার জন্য useful.
// Android app-এ এই API use করার দরকার নেই।
app.get("/stories/debug", function (req, res) {
  const data = readStoriesFile();

  if (!data.success) {
    return sendError(res, 500, data.error || "Could not load stories", {
      version: data.version || 1,
      stories: [],
    });
  }

  const debugStories = data.stories.map(function (story) {
    const fileName = story.file_name || "";
    const exists = audioFileExists(fileName);

    return {
      id: story.id || "",
      title: story.title || "",
      active: story.active === true,
      file_name: fileName,
      audio_path: story.audio_path || "",
      file_exists: exists,
    };
  });

  return res.json({
    success: true,
    version: data.version || 1,
    total: debugStories.length,
    stories: debugStories,
  });
});

// Audio file not found custom response
app.use("/audio", function (req, res) {
  return sendError(res, 404, "Audio file not found", {
    path: req.originalUrl,
    hint: "Check audio folder and stories.json file_name/audio_path extension",
  });
});

// 404 API handler
app.use(function (req, res) {
  return sendError(res, 404, "API not found", {
    path: req.originalUrl,
  });
});

// Global error handler
app.use(function (err, req, res, next) {
  console.error("Server Error:", err.message);

  return sendError(res, 500, "Internal server error");
});

// Start server
app.listen(PORT, function () {
  console.log("Kids Audio Story Server running on port " + PORT);
});
