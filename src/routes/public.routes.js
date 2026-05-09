"use strict";

const express = require("express");
const PublicController = require("../controllers/public.controller");

const router = express.Router();

router.get("/", PublicController.home);
router.get("/health", PublicController.health);

/*
Legacy/public APIs:
Production security mode-এ .env থেকে disabled থাকবে:
PUBLIC_STORIES_ENABLED=false
PUBLIC_AUDIO_ENABLED=false
*/
router.get("/stories", PublicController.publicStories);
router.get("/audio/:fileName", PublicController.publicAudio);

module.exports = router;