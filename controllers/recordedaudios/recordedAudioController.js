const path = require("path");
const fs = require("fs");
const { sequelize, User } = require("../../models");
const {
  buildAgentRecordedCallsQuery,
  buildAllAgentsNameMap,
  filterAndEnrichAgentRecordings,
} = require("../../utils/recordedAudioHelper");
const {
  resolveRecordedCallFilePath,
  DEFAULT_RECORDED_DIR,
} = require("../../utils/recordedCallAudio");

function buildRecordingUrls(filename) {
  const encoded = encodeURIComponent(filename);
  return {
    url: `/recorded-audio/${encoded}`,
    play_url: `/recordings/${encoded}`,
    stream_url: `/api/recorded-audio/${encoded}`,
  };
}

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

    const agentsMap = await buildAllAgentsNameMap(User);
    const enriched = filterAndEnrichAgentRecordings(rows, agentsMap);

    const data = enriched.map((r) => ({
      ...r,
      ...buildRecordingUrls(r.filename),
      file_found: Boolean(resolveRecordedCallFilePath(r.filename)),
    }));

    res.json(data);
  } catch (err) {
    console.error("getAllRecordedAudio:", err.message, err.stack);
    res.status(500).json({
      error: "Failed to fetch agent call recordings",
      detail: process.env.NODE_ENV === "production" ? undefined : err.message,
    });
  }
};

const getRecordedAudio = async (req, res) => {
  const filename = path.basename(decodeURIComponent(req.params.filename));
  const filePath = resolveRecordedCallFilePath(filename);

  if (!filePath) {
    console.warn("Recorded file not found:", filename);
    return res.status(404).json({
      error: "File not found",
      filename,
      hint: `Expected under ${DEFAULT_RECORDED_DIR}`,
    });
  }

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
    console.error("getRecordedAudio stream error:", err.message, filePath);
    res.status(404).json({ error: "File not found" });
  }
};

module.exports = { getAllRecordedAudio, getRecordedAudio };
