const express = require("express");
const router = express.Router();
const { getAllVoiceNotes } = require("../controllers/voiceNotesController");

router.get("/voice-notes", getAllVoiceNotes);

module.exports = router;