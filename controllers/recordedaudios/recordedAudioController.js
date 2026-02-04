 const path = require("path");
const fs = require("fs");
const { sequelize } = require("../../models");

const getAllRecordedAudio = async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        id,
        cdrstarttime,
        src AS caller,
        recordingfile AS filename
      FROM cdr
      WHERE recordingfile IS NOT NULL
      ORDER BY cdrstarttime DESC
      LIMIT 100
    `);

    const data = rows.map(r => ({
      ...r,
      url: `/recorded-audio/${encodeURIComponent(r.filename)}`
    }));

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch recordings" });
  }
};

const getRecordedAudio = async (req, res) => {
  const filename = path.basename(decodeURIComponent(req.params.filename));
  const filePath = path.resolve(__dirname, '../../recorded', filename);

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);

    const isDownload = req.query.download === 'true';

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`
    );

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(404).json({ error: "File not found" });
  }
};

module.exports = { getAllRecordedAudio, getRecordedAudio };
