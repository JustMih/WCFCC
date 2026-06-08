 // module.exports = router;
const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const VoiceNote = require("../../models/voice_notes.model");
const { authMiddleware } = require("../middleware/authMiddleware");
const { streamVoiceNote } = require("../controllers/reports.controller");
router.get("/voice-notes", authMiddleware, async (req, res) => {
  try {
    const agentId = req.query.agentId || req.user?.userId;
    const extension = req.query.extension;

    let where = {};
    if (agentId || extension) {
      const conditions = [];
      if (agentId) {
        conditions.push({ assigned_agent_id: String(agentId) });
      }
      if (extension) {
        conditions.push({ assigned_extension: String(extension) });
      }
      where = { [Op.or]: conditions };
    }

    const notes = await VoiceNote.findAll({
      where,
      order: [["created_at", "DESC"]],
    });

    res.json({ voiceNotes: notes });
  } catch (err) {
    console.error("Error fetching voice notes:", err);
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
