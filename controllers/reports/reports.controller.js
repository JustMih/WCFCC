// const VoiceNote = require('../../models/voice_notes.model');
// const CDR = require('../../models/cdr.model');
// const IVRDTMFMapping = require('../../models/ivr_dtmf_mappings.model');
// const {IVRAction, IVRVoice } = require('../../models'); 

// exports.getVoiceNotes = async (req, res) => {
//   try {
//     const voiceNotes = await VoiceNote.findAll();
//     res.json(voiceNotes);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// exports.getCDRReports = async (req, res) => {
//   console.log("CDR REPORT API HIT"); // Add this
//   try {
//     const cdrReports = await CDR.findAll();
//     console.log("CDR fetched successfully:", cdrReports.length);
//     res.json(cdrReports);
//   } catch (error) {
//     console.error("CDR REPORT ERROR:", error); // Add this
//     res.status(500).json({ error: error.message });
//   }
// };

 
// exports.getIVRInteractions = async (req, res) => {
//   try {
//     const ivrInteractions = await IVRDTMFMapping.findAll({
//       include: [
//         {
//           model: IVRAction, // Include action details
//           attributes: ['name'], // Only get the 'name' attribute
//           as: 'action', // Specify the alias 'action' if it was set in the association
//         },
//         {
//           model: IVRVoice, // Include voice details
//           attributes: ['file_name'], // Only get the 'file_name' attribute
//           as: 'voice', // Specify the alias 'voice' if it was set in the association
//         },
//       ],
//     });
//     res.json(ivrInteractions);
//   } catch (error) {
//     console.error("Error fetching IVR Interactions:", error);
//     res.status(500).json({ error: error.message });
//   }
// };

const VoiceNote = require('../../models/voice_notes.model');
const CDR = require('../../models/cdr.model');
const IVRDTMFMapping = require('../../models/ivr_dtmf_mappings.model');
const { IVRAction, IVRVoice } = require('../../models');
const path = require('path');
const fs = require('fs');

exports.getVoiceNotes = async (req, res) => {
  try {
    const voiceNotes = await VoiceNote.findAll();
    res.json(voiceNotes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.streamVoiceNote = async (req, res) => {
  const { id } = req.params;

  try {
    const voiceNote = await VoiceNote.findByPk(id);

    if (!voiceNote || !voiceNote.recording_path) {
      return res.status(404).send("Voice note not found in database");
    }

    const filePath = path.resolve(voiceNote.recording_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Voice file not found on disk");
    }

    res.sendFile(filePath, { headers: { 'Content-Type': 'audio/wav' } });
  } catch (error) {
    console.error("Error streaming voice note:", error);
    res.status(500).send("Internal server error");
  }
};

// exports.getCDRReports = async (req, res) => {
//   try {
//     const cdrReports = await CDR.findAll();
//     res.json(cdrReports);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };
exports.getCDRReports = async (req, res) => {
  try {
    const cdrReports = await CDR.findAll({
      order: [['cdrstarttime', 'DESC']] // Replace 'calldate' with your actual datetime column name
    });
    res.json(cdrReports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getIVRInteractions = async (req, res) => {
  try {
    const ivrInteractions = await IVRDTMFMapping.findAll({
      include: [
        { model: IVRAction, attributes: ['name'], as: 'action' },
        { model: IVRVoice, attributes: ['file_name'], as: 'voice' }
      ]
    });
    res.json(ivrInteractions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Serve the audio files
exports.serveVoiceNote = (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join('/var/lib/asterisk/sounds/custom', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.sendFile(filePath, { headers: { 'Content-Type': 'audio/wav' } });
};

