const sequelize = require("../../config/mysql_connection");
const { IVRDTMFLog } = require("../../models");

 
exports.getDTMFStats = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    if (startDate && endDate) {
      const { Op } = require("sequelize");
      where.timestamp = {
        [Op.between]: [
          `${startDate} 00:00:00`,
          `${endDate} 23:59:59`,
        ],
      };
    }

    const logs = await IVRDTMFLog.findAll({
      attributes: ['digit_pressed', 'caller_id', 'language', 'timestamp'],
      where,
      order: [['timestamp', 'DESC']],
      raw: true
    });

    console.log("✅ Success fetching DTMF logs", logs);
    res.json(logs);
  } catch (err) {
    console.error("❌ DTMF Stats Error:", err);
    res.status(500).json({ error: err.message });
  }
};
 