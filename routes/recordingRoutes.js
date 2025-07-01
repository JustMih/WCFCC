const express = require("express");
const router = express.Router();
const { getAllVoiceNotes,updateVoiceNote } = require("../controllers/ivrAction/ivrRecordingController");
const voiceNoteController = require('../controllers/voiceNoteController');

// Route to get all voice notes
router.get("/voice-notes", getAllVoiceNotes); 

router.put("/voice-notes/:id", updateVoiceNote); 
router.post('/voicenotes', voiceNoteController.captureVoiceNote);

module.exports = router;
