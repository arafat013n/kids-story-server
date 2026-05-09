"use strict";

const express = require("express");
const AdminController = require("../controllers/admin.controller");
const { authAdmin } = require("../middlewares/authAdmin");
const { uploadSingleAudio } = require("../middlewares/uploadAudio");

const router = express.Router();

/*
Admin login:
Body:
{
  "device_id": "...",
  "admin_app_key": "...",
  "admin_secret": "...",
  "package_name": "com.akash.kidsaudiostoryadmin"
}
*/
router.post("/login", AdminController.adminLogin);

/*
Protected admin APIs:
Authorization: Bearer <token>
X-Admin-Device-Id: <device_id>
*/
router.get("/stories", authAdmin, AdminController.listAdminStories);
router.get("/next-story-id", authAdmin, AdminController.getNextStoryId);

/*
Create story:
multipart/form-data
fields:
- title
- description
- duration optional
- category optional
- popular optional true/false
- active optional true/false
- audio file field name: audio

Server auto creates:
- story id: story_01, story_02...
- audio filename: story_01.mp3/wav/m4a
*/
router.post(
  "/stories",
  authAdmin,
  uploadSingleAudio,
  AdminController.createStoryWithAudio
);

/*
Update story metadata/status:
JSON body may include:
- title
- description or desc
- duration
- category
- active
- popular
*/
router.patch("/stories/:id", authAdmin, AdminController.updateStory);

/*
Replace story audio:
multipart/form-data
- audio file field name: audio
Server keeps same story id and renames uploaded audio to story_id.ext
*/
router.patch(
  "/stories/:id/audio",
  authAdmin,
  uploadSingleAudio,
  AdminController.replaceStoryAudio
);

/*
Soft delete:
active=false, audio file remains on server.
*/
router.delete("/stories/:id", authAdmin, AdminController.deleteStory);

/*
Hard delete:
story row + audio file permanently deleted.
Use carefully.
*/
router.delete("/stories/:id/hard", authAdmin, AdminController.hardDeleteStory);

module.exports = router;