const express = require("express");
const router = express.Router();
const {
  getCdrCounts,
  getAgentCdrStats,
  dailyAgentCallStatus,
  getLostCallsToday,
  getLostCallsDiagnosticsHandler,
  getReceivedCalls,
  getLostCalls,
  getDroppedCalls,
  markLostCallAsAnswered,
  markMissedCallCallback,
  getSlaMetrics,
} = require("../controllers/calls/calls");

router.get("/calls-count", getCdrCounts);
router.get("/sla-metrics", getSlaMetrics);
router.get("/agent-calls/:agentId", getAgentCdrStats);
router.get("/agent-calls-today/:agentId", dailyAgentCallStatus);
router.get("/lost-calls-today", getLostCallsToday);
router.get("/lost-calls-diagnostics", getLostCallsDiagnosticsHandler);
router.get("/received-calls", getReceivedCalls);
router.get("/lost-calls", getLostCalls);
router.get("/dropped-calls", getDroppedCalls);
router.post("/lost-calls/mark-answered", markLostCallAsAnswered);
router.post('/missed-calls/callback', markMissedCallCallback);
module.exports = router;
