const sequelize = require('../../config/database');
const { Op } = require('sequelize');
const CDR = require('../../models/CDR');

// Controller to get data for different time frames (Total, Monthly, Weekly, Daily)
const getCdrCounts = async (req, res) => {
  try {
    console.log("Current Date: ", new Date().toISOString());

    const totalCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr GROUP BY disposition"
    );

    const monthlyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND MONTH(cdrstarttime) = MONTH(CURDATE()) GROUP BY disposition"
    );

    const weeklyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND WEEK(cdrstarttime, 1) = WEEK(CURDATE(), 1) GROUP BY disposition"
    );

    const dailyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE DATE(cdrstarttime) = CURDATE() GROUP BY disposition"
    );

    const totalRows = await sequelize.query(
      "SELECT COUNT(*) AS total FROM cdr"
    );

    res.json({
      totalCounts: totalCounts[0],
      monthlyCounts: monthlyCounts[0],
      weeklyCounts: weeklyCounts[0],
      dailyCounts: dailyCounts[0],
      totalRows: totalRows[0][0].total,
    });
  } catch (err) {
    console.error("Error retrieving CDR data:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

const getAgentCdrStats = async (req, res) => {
  const agentId = req.params.agentId;
  const dstPattern = `PJSIP/${agentId}%`;

  try {
    // Inbound: agent was destination, only today's calls
    const inboundCalls = await sequelize.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE dstchannel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `, {
      replacements: { dstPattern },
      type: sequelize.QueryTypes.SELECT,
    });

    // Outbound: agent was source, only today's calls
    const outboundCalls = await sequelize.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE channel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `, {
      replacements: { dstPattern },
      type: sequelize.QueryTypes.SELECT,
    });

    res.json({
      inbound: inboundCalls[0],
      outbound: outboundCalls[0],
    });
  } catch (err) {
    console.error("Error fetching agent call stats:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// New: Only today's calls for agent
const getAgentCdrStatsToday = async (req, res) => {
  const agentId = req.params.agentId;
  const dstPattern = `PJSIP/${agentId}%`;

  try {
    // Inbound: agent was destination, only today's calls
    const inboundCalls = await sequelize.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE dstchannel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `, {
      replacements: { dstPattern },
      type: sequelize.QueryTypes.SELECT,
    });

    // Outbound: agent was source, only today's calls
    const outboundCalls = await sequelize.query(`
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE channel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `, {
      replacements: { dstPattern },
      type: sequelize.QueryTypes.SELECT,
    });

    res.json({
      inbound: inboundCalls[0],
      outbound: outboundCalls[0],
    });
  } catch (err) {
    console.error("Error fetching agent call stats (today):", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// ✅ Correct combined export
module.exports = {
  getCdrCounts,
  getAgentCdrStats,
  dailyAgentCallStatus: getAgentCdrStatsToday,
};
