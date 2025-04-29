const sequelize = require("../../config/mysql_connection"); // Adjust path if needed

// Get all voice notes
const getAllVoiceNotes = async (req, res) => {
  try {
    const [voiceNotes] = await sequelize.query(
      "SELECT id, recording_path, clid, created_at FROM Voice_Notes ORDER BY created_at DESC"
    );
    return res.status(200).json({ voiceNotes });
  } catch (error) {
    console.error("Error fetching voice notes:", error.message);
    return res.status(500).json({ message: "Failed to fetch voice notes", error: error.message });
  }
};

module.exports = {
  getAllVoiceNotes,
};
