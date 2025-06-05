const express = require("express");
const router = express.Router();
const VoiceNote = require('../../models/voice_notes.model');
const { getVoiceNotes ,serveVoiceNote,streamVoiceNote } = require("../controllers/reports.controller");

router.get("/voice-notes", getVoiceNotes );
router.get('/voice-notes/:filename', serveVoiceNote);
router.get("/voice-notes/:id/audio", streamVoiceNote); // <- this was missing!
// routes/voiceNoteRoutes.js
router.put('/voice-notes/:id/mark-played', async (req, res) => {
    try {
      const id = req.params.id;
      const result = await VoiceNote.update({ is_played: true }, { where: { id } });
  
      console.log("Mark played result:", result); // Should show [1] if successful
      res.json({ success: true });
    } catch (error) {
      console.error("Mark played error:", error);
      res.status(500).json({ error: "Failed to mark as played" });
    }
  });
  
  
module.exports = router;