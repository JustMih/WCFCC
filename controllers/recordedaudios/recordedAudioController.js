const db = require("../../models");
const path = require("path");
const fs = require("fs");
const RecordedAudio = db.RecordedAudio; // This must be defined

const getAllRecordedAudio = async (req, res) => {
  try {
    const calls = await RecordedAudio.findAll({
      where: {
        recordingfile: {
          [db.Sequelize.Op.ne]: null,
        },
      },
      order: [["clid", "DESC"]],
      limit: 50,
    });

    const result = calls.map((call) => {
      return {
        filename: call.recordingfile,
        url: `/api/recorded-audio/${encodeURIComponent(call.recordingfile)}`,
        created: call.cdrstarttime,
        caller: call.clid,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("Failed to load recordings:", err);
    res.status(500).json({ error: "Failed to load recordings" });
  }
};

const getRecordedAudio = async (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  if (!filename.endsWith(".wav") || filename.includes("..")) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const filePath = path.join("/var/spool/asterisk/monitor", filename);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.sendFile(filePath, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(`File not found: ${filePath}`, err);
    res.status(404).json({ error: "File not found" });
  }
};

module.exports = {
  getAllRecordedAudio,
  getRecordedAudio,
};
