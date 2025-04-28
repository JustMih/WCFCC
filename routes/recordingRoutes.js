const express = require("express");
const router = express.Router();
const { getAllVoiceNotes } = require("../controllers/ivrAction/ivrRecordingController");

// Route to get all voice notes
router.get("/voice-notes", getAllVoiceNotes);

module.exports = router;
