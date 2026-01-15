const sequelize = require("../../config/database");
const { Op } = require("sequelize");
const CDR = require("../../models/CDR");

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
    const inboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE dstchannel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Outbound: agent was source, only today's calls
    const outboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE channel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

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
    const inboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE dstchannel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Outbound: agent was source, only today's calls
    const outboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE channel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      inbound: inboundCalls[0],
      outbound: outboundCalls[0],
    });
  } catch (err) {
    console.error("Error fetching agent call stats (today):", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Get lost calls for today with phone numbers
const getLostCallsToday = async (req, res) => {
  try {
    const lostCalls = await sequelize.query(
      `SELECT mc.caller, mc.time AS call_time, mc.status, mc.called_back_by AS callback_agent_extension, u.full_name AS callback_agent_name, mc.called_back_at AS callback_time, mc.billsec AS callback_duration FROM MissedCalls mc LEFT JOIN Users u ON u.extension = mc.called_back_by WHERE DATE(mc.time) = CURDATE() AND mc.archived = 0 ORDER BY mc.time DESC`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json(lostCalls);
  } catch (err) {
    console.error("Error retrieving lost calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Get all received calls (ANSWERED calls)
const getReceivedCalls = async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const receivedCalls = await sequelize.query(
      `SELECT 
        clid AS caller,
        cdrstarttime AS call_time,
        disposition,
        duration,
        src AS agent_extension,
        dst AS destination,
        dstchannel AS destination_channel
      FROM cdr 
      WHERE disposition = 'ANSWERED'
        AND clid IS NOT NULL
        AND clid != ''
      ORDER BY cdrstarttime DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const totalCount = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM cdr 
       WHERE disposition = 'ANSWERED'
         AND clid IS NOT NULL
         AND clid != ''`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      calls: receivedCalls,
      total: totalCount[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error retrieving received calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Get all lost calls (NO ANSWER calls that were in queue)
const getLostCalls = async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const lostCalls = await sequelize.query(
      `SELECT 
        clid AS caller,
        cdrstarttime AS call_time,
        disposition,
        duration,
        src AS agent_extension,
        dst AS destination,
        lastapp
      FROM cdr 
      WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
        AND lastapp = 'Queue'
        AND clid IS NOT NULL
        AND clid != ''
      ORDER BY cdrstarttime DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const totalCount = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM cdr 
       WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
         AND lastapp = 'Queue'
         AND clid IS NOT NULL
         AND clid != ''`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      calls: lostCalls,
      total: totalCount[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error retrieving lost calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Get all dropped calls (calls that hung up without answer and were NOT in queue)
const getDroppedCalls = async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const droppedCalls = await sequelize.query(
      `SELECT 
        clid AS caller,
        cdrstarttime AS call_time,
        disposition,
        duration,
        src AS agent_extension,
        dst AS destination,
        lastapp
      FROM cdr 
      WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
        AND (lastapp IS NULL OR lastapp != 'Queue')
        AND clid IS NOT NULL
        AND clid != ''
      ORDER BY cdrstarttime DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const totalCount = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM cdr 
       WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
         AND (lastapp IS NULL OR lastapp != 'Queue')
         AND clid IS NOT NULL
         AND clid != ''`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      calls: droppedCalls,
      total: totalCount[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error retrieving dropped calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Mark lost call as answered (called back)
const markLostCallAsAnswered = async (req, res) => {
  try {
    const { caller, call_time } = req.body;

    if (!caller || !call_time) {
      return res.status(400).json({
        error: "Missing required fields: caller and call_time",
      });
    }

    // Update the CDR record to change disposition from NO ANSWER to ANSWERED
    const result = await sequelize.query(
      `UPDATE cdr 
       SET disposition = 'ANSWERED'
       WHERE clid = :caller 
         AND DATE(cdrstarttime) = DATE(:call_time)
         AND (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
         AND lastapp = 'Queue'`,
      {
        replacements: {
          caller: caller,
          call_time: call_time,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    // For MySQL, result is an array where first element contains metadata with affectedRows
    const affectedRows = result?.[0]?.affectedRows || 0;

    if (affectedRows === 0) {
      return res.status(404).json({
        error: "Lost call not found or already updated",
      });
    }

    res.json({
      success: true,
      message: "Lost call marked as answered",
      updatedRows: affectedRows,
    });
  } catch (err) {
    console.error("Error marking lost call as answered:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ✅ Correct combined export
module.exports = {
  getCdrCounts,
  getAgentCdrStats,
  dailyAgentCallStatus: getAgentCdrStatsToday,
  getLostCallsToday,
  getReceivedCalls,
  getLostCalls,
  getDroppedCalls,
  markLostCallAsAnswered,
};
