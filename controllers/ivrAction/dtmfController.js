const sequelize = require("../../config/mysql_connection");
const { IVRDTMFLog } = require("../../models");

 
exports.getDTMFStats = async (req, res) => {
    try {
      const stats = await IVRDTMFLog.findAll({
        attributes: [
          'digit_pressed',
          [sequelize.fn('COUNT', sequelize.col('digit_pressed')), 'count']
        ],
        group: ['digit_pressed'],
        order: [[sequelize.literal('count'), 'DESC']],
        raw: true
      });
      
      console.log("✅ DTMF Stats API Hit");
      console.log(stats); // Show result

      res.json(stats);
    } catch (err) {
      console.error("❌ Error in getDTMFStats:", err);
      res.status(500).json({ error: err.message });
    }
};
