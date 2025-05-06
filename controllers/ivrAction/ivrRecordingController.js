const sequelize = require("../../config/mysql_connection");  
 
const VoiceNote = require("../../models/VoiceNote");
// In your voice notes controller
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
        ) as playable_path,
        clid, 
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

module.exports = { getAllVoiceNotes };