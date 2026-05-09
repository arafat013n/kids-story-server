"use strict";

const express = require("express");
const MainController = require("../controllers/main.controller");
const { authMainApp } = require("../middlewares/authMainApp");

const router = express.Router();

/*
Main app auth:
App first token নেবে, তারপর protected API access করবে।
*/
router.post("/token", MainController.issueMainToken);

/*
Protected main app APIs:
Authorization: Bearer <token>
X-Device-Id: <device_id>
*/
router.get("/stories", authMainApp, MainController.listMainStories);
router.get("/audio/:fileName", authMainApp, MainController.streamMainAudio);

module.exports = router;