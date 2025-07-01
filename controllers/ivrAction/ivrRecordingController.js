const sequelize = require("../../config/mysql_connection");  
const VoiceNote = require("../../models/VoiceNote");

const getAllVoiceNotes = async (req, res) => {
  try {
    const [voiceNotes] = await sequelize.query(`
      SELECT 
        id,
        recording_path,
        CONCAT('custom/', 
          SUBSTRING_INDEX(
            SUBSTRING_INDEX(recording_path, '/', -1), 
            '.', 
            1
          ), 
          '.wav'
        ) AS playable_path,
        clid, 
        assigned_agent_id,
        is_played,
        duration_seconds,
        transcription,
        created_at 
      FROM Voice_Notes 
      ORDER BY created_at DESC
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


module.exports = {
  getAllVoiceNotes,
  updateVoiceNote // ✅ include this so it's usable in routes
};
