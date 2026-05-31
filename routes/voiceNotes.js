 // module.exports = router;
const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const VoiceNote = require("../../models/voice_notes.model");
const { authMiddleware } = require("../middleware/authMiddleware");
const { streamVoiceNote } = require("../controllers/reports.controller");
router.get("/voice-notes", authMiddleware, async (req, res) => {
  try {
    console.log("🔥 USING MODEL FILE:", require.resolve("../../models/voice_notes.model"));
    console.log("🔥 MODEL NAME:", VoiceNote.name);
    console.log("🔥 MODEL ATTRIBUTES:", Object.keys(VoiceNote.rawAttributes));

    const notes = await VoiceNote.findAll({
      order: [["created_at", "DESC"]],
    });

    console.log("📦 FIRST ROW:", notes[0]?.toJSON());

    res.json({ voiceNotes: notes });
  } catch (err) {
    console.error("❌ Error fetching voice notes:", err);
    res.status(500).json({ error: "Failed to fetch voice notes" });
  }
});

// List voice notes
router.put("/voice-notes/:id/mark-played", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const agentExtension = req.user.extension;

    await VoiceNote.update(
      {
        is_played: true,
        played_by: agentExtension,
        played_at: new Date(),
        status: "LISTENED",
      },
      { where: { id } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Mark played error:", error);
    res.status(500).json({ error: "Failed to mark as played" });
  }
});

// Stream audio (🔥 MUST be before generic routes)
router.get("/voice-notes/:id/audio", streamVoiceNote);

module.exports = router;
