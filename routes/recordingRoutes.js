const express = require("express");
const router = express.Router();
const {
  getAllVoiceNotes,
  updateVoiceNote,
  markVoiceNotePlayed,
} = require("../controllers/ivrAction/ivrRecordingController");
const voiceNoteController = require("../controllers/voiceNoteController");
const { streamVoiceNote } = require("../controllers/reports/reports.controller");
const { authMiddleware } = require("../middleware/authMiddleware");

/** Mounted at /api/voice-notes in server.js */
router.get("/", authMiddleware, getAllVoiceNotes);
router.put("/:id/mark-played", authMiddleware, markVoiceNotePlayed);
router.put("/:id", authMiddleware, updateVoiceNote);
router.get("/:id/audio", streamVoiceNote);

module.exports = router;
