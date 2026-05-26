const sequelize = require("../../config/mysql_connection");
const VoiceNote = require("../../models/voice_notes.model");
const User = require("../../models/User");

const getAllVoiceNotes = async (req, res) => {
  try {
 const [voiceNotes] = await sequelize.query(`
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
  u.full_name AS assigned_agent_name,   -- ✅ FIXED HERE
  vn.is_played,
  vn.duration_seconds,
  vn.transcription,
  vn.created_at
FROM Voice_Notes vn
LEFT JOIN Users u
  ON u.extension = vn.assigned_extension
ORDER BY vn.created_at DESC;

`);

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

    const [updatedRows] = await VoiceNote.update(
      {
        is_played: 1,
        played_by: playedBy,
        played_at: new Date(),
        status: "LISTENED",
      },
      { where: { id } }
    );

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
