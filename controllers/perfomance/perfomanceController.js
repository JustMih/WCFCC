const sequelize = require("../../config/mysql_connection");
const { DataTypes, Op, fn, col, literal } = require("sequelize");
const moment = require("moment");

const CEL = require("../../models/CEL")(sequelize, DataTypes);
const CDR = require("../../models/CDR")(sequelize, DataTypes);

// 1. Average Handling Time (AHT) - based on billsec from CDR
async function getAverageHandlingTime(agentId) {
  const where = agentId !== "all"
    ? { src: agentId, disposition: "ANSWERED" }
    : { disposition: "ANSWERED" };

  const result = await CDR.findOne({
    attributes: [[fn("AVG", col("billsec")), "avg_aht"]],
    where,
    raw: true,
  });

  return Math.round(result?.avg_aht || 0);
}

// 2. First Response Time (FRT) - stub
async function getFirstResponseTime(agentId) {
  // TODO: Implement actual response time from CHAN_START → ANSWER in CEL
  return 45;
}

// 3. First Call Resolution (FCR) - % of unique dst without repeat within 24h
async function getFirstCallResolution(agentId) {
  const where = agentId !== "all" ? { src: agentId } : {};

  const [uniqueCallers, repeatCallers] = await Promise.all([
    CDR.count({
      distinct: true,
      col: "dst",
      where,
    }),
    CDR.count({
      where: {
        ...where,
        calldate: {
          [Op.gt]: moment().subtract(24, "hours").toDate(),
        },
      },
    }),
  ]);

  const repeat = Math.min(repeatCallers, uniqueCallers);
  return uniqueCallers > 0
    ? parseFloat(((uniqueCallers - repeat) / uniqueCallers) * 100).toFixed(1)
    : 0;
}

// 4. Average Speed of Answer (ASA) - stub
async function getAverageSpeedOfAnswer(agentId) {
  // TODO: Implement using time between RINGING and ANSWER in CEL
  return 30;
}

// 5. Abandonment Rate (AVAR) - calls that didn't reach ANSWER
async function getAbandonRate(agentId) {
  const filter = agentId !== "all" ? { cid_num: agentId } : {};

  const [totalCalls, answeredCalls] = await Promise.all([
    CEL.count({ where: { eventtype: "CHAN_START", ...filter } }),
    CEL.count({ where: { eventtype: "ANSWER", ...filter } }),
  ]);

  const abandoned = totalCalls - answeredCalls;
  return totalCalls > 0
    ? parseFloat((abandoned / totalCalls) * 100).toFixed(1)
    : 0;
}

// 6. Unanswered Rate - from CDR disposition
async function getUnansweredRate(agentId) {
  const filter = agentId !== "all" ? { src: agentId } : {};

  const [total, noAnswer] = await Promise.all([
    CDR.count({ where: filter }),
    CDR.count({ where: { ...filter, disposition: "NO ANSWER" } }),
  ]);

  return total > 0 ? parseFloat((noAnswer / total) * 100).toFixed(1) : 0;
}

// 7. Customer Satisfaction (CSAT) - stubbed
async function getCustomerSatisfaction(agentId) {
  // TODO: Pull from surveys if available
  return 92;
}

// ⬇️ Combine all metrics for an agent
async function getIndividualMetrics(agentId) {
  try {
    const [aht, frt, fcr, asa, avar, unanswered, cs] = await Promise.all([
      getAverageHandlingTime(agentId),
      getFirstResponseTime(agentId),
      getFirstCallResolution(agentId),
      getAverageSpeedOfAnswer(agentId),
      getAbandonRate(agentId),
      getUnansweredRate(agentId),
      getCustomerSatisfaction(agentId),
    ]);

    return { aht, frt, fcr, asa, avar, unanswered, cs };
  } catch (error) {
    console.error("Error fetching individual metrics:", error);
    throw error;
  }
}

// ⬇️ Team average = aggregated using agentId = "all"
async function getTeamAverageMetrics() {
  return await getIndividualMetrics("all");
}

// ⬇️ Route handler: /api/performance/:agentId
async function getAgentPerformance(req, res) {
    try {
      const { agentId } = req.params;
      const individual = await getIndividualMetrics(agentId);
      const team = await getTeamAverageMetrics();
  
      res.json({
        success: true,
        message: "Agent performance metrics retrieved successfully",
        data: {
          agentId,
          individual,
          team
        }
      });
    } catch (error) {
      console.error("Error in getAgentPerformance:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch performance metrics"
      });
    }
  }
  

// ⬇️ Route handler: /api/performance/team/summary
async function getTeamSummary(req, res) {
  try {
    const team = await getTeamAverageMetrics();
    res.json(team);
  } catch (error) {
    console.error("Error in getTeamSummary:", error);
    res.status(500).json({ error: "Failed to fetch team metrics" });
  }
}

// ✅ Exports
module.exports = {
  getIndividualMetrics,
  getTeamAverageMetrics,
  getAgentPerformance,
  getTeamSummary,
};
