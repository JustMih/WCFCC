const VoiceNote = require('../../models/voice_notes.model');
const CDR = require('../../models/cdr.model');
const IVRDTMFMapping = require('../../models/ivr_dtmf_mappings.model');


exports.getVoiceNotes = async (req, res) => {
  try {
    const voiceNotes = await VoiceNote.findAll();
    res.json(voiceNotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getCDRReports = async (req, res) => {
  console.log("CDR REPORT API HIT"); // Add this
  try {
    const cdrReports = await CDR.findAll();
    console.log("CDR fetched successfully:", cdrReports.length);
    res.json(cdrReports);
  } catch (error) {
    console.error("CDR REPORT ERROR:", error); // Add this
    res.status(500).json({ error: error.message });
  }
};

exports.getIVRInteractions = async (req, res) => {
  try {
    const ivrInteractions = await IVRDTMFMapping.findAll();
    res.json(ivrInteractions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
