const assignVoiceNoteRoundRobin = require('../services/assignVoiceNoteRoundRobin');

exports.captureVoiceNote = async (req, res) => {
  try {
    // Log the full body for debugging
    console.log("Voice Note POST Body:", req.body);

    const {
      recording_path,
      clid,
      assigned_agent_id,
      duration_seconds,
      transcription
    } = req.body;

    const voiceNoteData = {
      recording_path,
      clid,
      assigned_agent_id,
      duration_seconds,
      transcription,
      created_at: new Date()
    };

    const result = await assignVoiceNoteRoundRobin(voiceNoteData);
    res.status(201).json(result);
  } catch (error) {
    console.error("VoiceNote Assignment Error:", error);
    res.status(500).json({
      message: "Failed to assign voice note.",
      error: error.message
    });
  }
};
