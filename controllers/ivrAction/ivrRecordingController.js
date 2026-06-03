const sequelize = require("../../config/mysql_connection");
const VoiceNote = require("../../models/voice_notes.model");
const User = require("../../models/User");

const getAllVoiceNotes = async (req, res) => {
  try {
    const { agentId, unplayedOnly } = req.query;
    const conditions = [];
    const replacements = {};

    if (unplayedOnly === "true" || unplayedOnly === "1") {
      conditions.push("(vn.is_played = 0 OR vn.is_played IS NULL)");
    }

    if (agentId) {
      const user = await User.findByPk(agentId, {
        attributes: ["extension", "id"],
      });
      if (user) {
        // Match by user id OR extension (round-robin often sets only assigned_agent_id)
        conditions.push(
          "(vn.assigned_agent_id = :agentUserId OR vn.assigned_extension = :agentExtension)"
        );
        replacements.agentUserId = String(user.id);
        replacements.agentExtension = user.extension
          ? String(user.extension)
          : "__no_extension__";
      } else {
        conditions.push("vn.assigned_agent_id = :agentUserId");
        replacements.agentUserId = String(agentId);
      }
    } else if (req.query.extension) {
      conditions.push("vn.assigned_extension = :agentExtension");
      replacements.agentExtension = String(req.query.extension);
    }

    const whereSql =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const voiceNotes = await sequelize.query(
      `
SELECT 
  vn.id,
  vn.recording_path,
  CONCAT(
    'custom/',
    SUBSTRING_INDEX(
      SUBSTRING_INDEX(vn.recording_path, '/', -1),
      '.',
      1
    ),
    '.wav'
  ) AS playable_path,
  vn.clid,
  vn.assigned_extension,
  u.full_name AS assigned_agent_name,
  vn.is_played,
  vn.duration_seconds,
  vn.transcription,
  vn.status,
  vn.created_at
FROM Voice_Notes vn
LEFT JOIN Users u
  ON u.extension = vn.assigned_extension
${whereSql}
ORDER BY vn.created_at DESC
      `,
      { replacements, type: sequelize.QueryTypes.SELECT }
    );

    res.status(200).json({ voiceNotes });
  } catch (error) {
    console.error("Error fetching voice notes:", error);
    res.status(500).json({ message: "Failed to fetch voice notes" });
  }
};

const updateVoiceNote = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      recording_path,
      clid,
      assigned_agent_id,
      is_played,
      duration_seconds,
      transcription
    } = req.body;
   
    // ✅ Debug: show incoming values
    console.log("🔄 Updating Voice Note ID:", id);
    console.log("📥 Request body values:", {
      recording_path,
      clid,
      assigned_agent_id,
      is_played,
      duration_seconds,
      transcription
    });

    const [updatedRows] = await VoiceNote.update(
      {
        recording_path,
        clid,
        assigned_agent_id,
        is_played,
        duration_seconds,
        transcription
      },
      {
        where: { id }
      }
    );

    console.log("✅ Rows updated:", updatedRows);

    if (updatedRows === 0) {
      return res.status(404).json({ message: "Voice note not found or unchanged." });
    }

    const updatedVoiceNote = await VoiceNote.findByPk(id);
    res.status(200).json({ message: "Voice note updated.", voiceNote: updatedVoiceNote });
  } catch (error) {
    console.error("❌ Error updating voice note:", error);
    res.status(500).json({ error: "Failed to update voice note." });
  }
};


const markVoiceNotePlayed = async (req, res) => {
  try {
    const { id } = req.params;
    const { duration_seconds: durationFromBody } = req.body || {};
    const userId = req.user?.userId;

    let playedBy = null;
    if (userId) {
      const user = await User.findByPk(userId, {
        attributes: ["extension", "username", "full_name"],
      });
      if (user) {
        playedBy =
          user.extension ||
          user.username ||
          user.full_name ||
          String(userId);
      }
    }

    const existing = await VoiceNote.findByPk(id, {
      attributes: ["id", "duration_seconds"],
    });
    if (!existing) {
      return res.status(404).json({ error: "Voice note not found" });
    }

    const payload = {
      is_played: 1,
      played_by: playedBy,
      played_at: new Date(),
      status: "LISTENED",
    };

    const parsedDuration = parseInt(durationFromBody, 10);
    if (!Number.isNaN(parsedDuration) && parsedDuration > 0) {
      payload.duration_seconds = parsedDuration;
    }

    const [updatedRows] = await VoiceNote.update(payload, { where: { id } });

    if (updatedRows === 0) {
      return res.status(404).json({ error: "Voice note not found" });
    }

    res.json({ success: true, id: Number(id), is_played: true, played_by: playedBy });
  } catch (error) {
    console.error("Error marking voice note as played:", error);
    res.status(500).json({ error: "Failed to mark voice note as played" });
  }
};

module.exports = {
  getAllVoiceNotes,
  updateVoiceNote,
  markVoiceNotePlayed,
};
