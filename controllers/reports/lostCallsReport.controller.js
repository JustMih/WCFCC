const sequelize = require("../../config/mysql_connection");
const { fetchLostCallsForRange } = require("../../utils/missedCallHelper");

exports.getLostCallsReport = async (req, res) => {
  const { startDate, endDate } = req.params;
  const dispositionFilter = (req.query.disposition || "all").trim();

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    const startDateTime = `${startDate} 00:00:00`;
    const endDateTime = `${endDate} 23:59:59`;
    let records = await fetchLostCallsForRange(
      sequelize,
      startDateTime,
      endDateTime
    );

    if (dispositionFilter && dispositionFilter.toLowerCase() !== "all") {
      const want = dispositionFilter.toUpperCase();
      records = records.filter(
        (r) => String(r.disposition || "").toUpperCase() === want
      );
    }

    res.json({
      summary: { total: records.length },
      records,
    });
  } catch (err) {
    console.error("Lost calls report error:", err);
    res.status(500).json({
      error: "Failed to generate lost calls report",
      message: err.message,
    });
  }
};
