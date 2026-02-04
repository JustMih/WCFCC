const sequelize = require("../../config/mysql_connection");
const { IVRDTMFLog } = require("../../models");

 
exports.getDTMFStats = async (req, res) => {
  try {
    console.log("👉 Fetching full DTMF logs");

    const logs = await IVRDTMFLog.findAll({
      attributes: ['digit_pressed', 'caller_id', 'language', 'timestamp'],
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
 