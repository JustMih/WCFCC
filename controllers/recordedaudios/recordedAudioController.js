 const path = require("path");
const fs = require("fs");
const { sequelize } = require("../../models");

const getAllRecordedAudio = async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        id,
        cdrstarttime AS created,
        src AS caller,
        recordingfile AS filename
      FROM cdr
      WHERE recordingfile IS NOT NULL
      ORDER BY cdrstarttime DESC
      LIMIT 100
    `);

    const data = rows.map(row => ({
      ...row,
      url: `/api/recorded-audio/${encodeURIComponent(row.filename)}`
    }));

    res.json(data);
  } catch (err) {
    console.error("DB error:", err);
    res.status(500).json({ error: "Failed to fetch recordings" });
  }
};

const getRecordedAudio = async (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const safeName = path.basename(filename);

  // Dynamically switch based on environment (Linux or Windows)
  const isProduction = process.env.NODE_ENV === "production";
  const filePath = isProduction
    ? path.join("/opt/wcf_call_center_backend/recorded", safeName)  // Linux server path
    : path.resolve(__dirname, "../../recorded", safeName);          // Local dev path

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.sendFile(filePath, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": `inline; filename="${safeName}"`
      }
    });
  } catch (err) {
    console.error(`File not found: ${filePath}`, err);
    res.status(404).json({ error: "File not found" });
  }
};

module.exports = {
  getAllRecordedAudio,
  getRecordedAudio
};
