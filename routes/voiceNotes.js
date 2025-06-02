const express = require("express");
const router = express.Router();
const { getVoiceNotes ,serveVoiceNote,streamVoiceNote } = require("../controllers/reports.controller");

router.get("/voice-notes", getVoiceNotes );
router.get('/voice-notes/:filename', serveVoiceNote);
router.get("/voice-notes/:id/audio", streamVoiceNote); // <- this was missing!
module.exports = router;