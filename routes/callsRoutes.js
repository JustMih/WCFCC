const express = require("express");
const router = express.Router();
const {
  getCdrCounts,
  getAgentCdrStats,
  dailyAgentCallStatus,
  getLostCallsToday,
  getReceivedCalls,
  getLostCalls,
  getDroppedCalls,
  markLostCallAsAnswered,
} = require("../controllers/calls/calls");

router.get("/calls-count", getCdrCounts);
router.get("/agent-calls/:agentId", getAgentCdrStats);
router.get("/agent-calls-today/:agentId", dailyAgentCallStatus);
router.get("/lost-calls-today", getLostCallsToday);
router.get("/received-calls", getReceivedCalls);
router.get("/lost-calls", getLostCalls);
router.get("/dropped-calls", getDroppedCalls);
router.post("/lost-calls/mark-answered", markLostCallAsAnswered);

module.exports = router;
