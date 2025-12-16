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

// Safely require models with error handling
let VoiceNote, CDR, IVRDTMFMapping, IVRAction, IVRVoice;
try {
  console.log("Loading VoiceNote model...");
  VoiceNote = require("../../models/voice_notes.model");
  console.log("Loading CDR model...");
  CDR = require("../../models/cdr.model");
  console.log("Loading IVRDTMFMapping model...");
  IVRDTMFMapping = require("../../models/ivr_dtmf_mappings.model");
  console.log("Loading models index...");
  let models;
  try {
    models = require("../../models");
    console.log("Models loaded, available keys:", Object.keys(models || {}));
    // Safely get IVRAction and IVRVoice with fallback
    if (models) {
      IVRAction = models.IVRAction;
      IVRVoice = models.IVRVoice;
    }
  } catch (modelsError) {
    console.error("Error loading models index, trying direct require:", modelsError.message);
  }
  
  // Fallback: try direct require if models index failed
  if (!IVRAction) {
    try {
      IVRAction = require("../../models/IVRAction");
    } catch (e) {
      console.error("Failed to load IVRAction:", e.message);
    }
  }
  if (!IVRVoice) {
    try {
      IVRVoice = require("../../models/IVRVoice");
    } catch (e) {
      console.error("Failed to load IVRVoice:", e.message);
    }
  }
  console.log("Model loading complete");
} catch (error) {
  console.error("Error loading models in reports controller:", error);
  console.error("Error stack:", error.stack);
  // Models will be undefined, but we'll handle this in the functions
}

const path = require("path");
const fs = require("fs");
const sequelize = require("../../config/mysql_connection"); // Adjust the path as necessary

exports.getVoiceNotes = async (req, res) => {
  try {
    if (!VoiceNote) {
      throw new Error("VoiceNote model is not available");
    }
    const voiceNotes = await VoiceNote.findAll();
    res.json(voiceNotes);
  } catch (error) {
    console.error("Error in getVoiceNotes:", error);
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

    res.sendFile(filePath, { headers: { "Content-Type": "audio/wav" } });
  } catch (error) {
    console.error("Error streaming voice note:", error);
    res.status(500).send("Internal server error");
  }
};

exports.getCDRReports = async (req, res) => {
  try {
    if (!CDR) {
      throw new Error("CDR model is not available");
    }
    const cdrReports = await CDR.findAll({
      order: [["cdrstarttime", "DESC"]], // Replace 'calldate' with your actual datetime column name
    });
    res.json(cdrReports);
  } catch (error) {
    console.error("Error in getCDRReports:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getIVRInteractions = async (req, res) => {
  try {
    if (!IVRDTMFMapping || !IVRAction || !IVRVoice) {
      throw new Error("IVR models are not available");
    }
    const ivrInteractions = await IVRDTMFMapping.findAll({
      include: [
        { model: IVRAction, attributes: ["name"], as: "action" },
        { model: IVRVoice, attributes: ["file_name"], as: "voice" },
      ],
    });
    res.json(ivrInteractions);
  } catch (error) {
    console.error("Error in getIVRInteractions:", error);
    res.status(500).json({ error: error.message });
  }
};

// Serve the audio files
exports.serveVoiceNote = (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join("/var/lib/asterisk/sounds/custom", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.sendFile(filePath, { headers: { "Content-Type": "audio/wav" } });
};

exports.getVoiceReport = (req, res) => {
  const { startDate, endDate } = req.params; // <-- use req.params

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  const query = sequelize.query(
    `SELECT * FROM Voice_Notes WHERE created_at BETWEEN :startDate AND :endDate`,
    {
      replacements: { startDate, endDate },
      type: sequelize.QueryTypes.SELECT,
    }
  );
  query
    .then((voices) => {
      if (voices.length === 0) {
        return res.status(404).json({ message: "No voice notes found" });
      }
      res.json(voices);
    })
    .catch((error) => {
      console.error("Error fetching voice notes:", error);
      res.status(500).json({ error: error.message });
    });
};

exports.getCDRReport = (req, res) => {
  const { startDate, endDate, disposition } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  let query = `SELECT * FROM cdr WHERE cdrstarttime BETWEEN :startDate AND :endDate`;
  let replacements = { startDate, endDate };

  // Add disposition filter if provided
  if (disposition && disposition !== "all") {
    query += ` AND disposition = :disposition`;
    replacements.disposition = disposition;
  }

  query += ` ORDER BY cdrstarttime DESC`;

  const cdrQuery = sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  cdrQuery
    .then((cdrData) => {
      if (cdrData.length === 0) {
        return res.status(404).json({ message: "No CDR records found" });
      }
      res.json(cdrData);
    })
    .catch((error) => {
      console.error("Error fetching CDR data:", error);
      res.status(500).json({ error: error.message });
    });
};
