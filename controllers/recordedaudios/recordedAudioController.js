const path = require("path");
const fs = require("fs");
const { sequelize } = require("../../models");
const { buildAgentRecordedCallsQuery } = require("../../utils/recordedAudioHelper");

const getAllRecordedAudio = async (req, res) => {
  try {
    const { startDate, endDate, limit } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 2000);

    const { sql, replacements } = buildAgentRecordedCallsQuery({
      startDate: startDate || null,
      endDate: endDate || null,
      limit: parsedLimit,
    });

    const rows = await sequelize.query(sql, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    const data = rows.map((r) => ({
      ...r,
      url: `/recorded-audio/${encodeURIComponent(r.filename)}`,
    }));

    res.json(data);
  } catch (err) {
    console.error("getAllRecordedAudio:", err);
    res.status(500).json({ error: "Failed to fetch agent call recordings" });
  }
};

const getRecordedAudio = async (req, res) => {
  const filename = path.basename(decodeURIComponent(req.params.filename));
  const filePath = path.resolve(__dirname, "../../recorded", filename);

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);

    const isDownload = req.query.download === "true";

    res.setHeader("Content-Type", "audio/wav");
    res.setHeader(
      "Content-Disposition",
      `${isDownload ? "attachment" : "inline"}; filename="${filename}"`
    );

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(404).json({ error: "File not found" });
  }
};

module.exports = { getAllRecordedAudio, getRecordedAudio };
