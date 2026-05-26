const express = require("express");
const router = express.Router();
const {
  getAllVoiceNotes,
  updateVoiceNote,
  markVoiceNotePlayed,
} = require("../controllers/ivrAction/ivrRecordingController");
const voiceNoteController = require('../controllers/voiceNoteController');
const { streamVoiceNote } = require("../controllers/reports/reports.controller");
const { authMiddleware } = require("../middleware/authMiddleware");

// Route to get all voice notes
router.get("/voice-notes", getAllVoiceNotes);

router.put("/voice-notes/:id/mark-played", authMiddleware, markVoiceNotePlayed);

router.put("/voice-notes/:id", updateVoiceNote);
router.post('/voicenotes', voiceNoteController.captureVoiceNote);

// Route to stream audio file for voice note
router.get("/voice-notes/:id/audio", streamVoiceNote);

module.exports = router;
