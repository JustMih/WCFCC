const express = require("express");
const router = express.Router();
const {
  getCdrCounts,
  getAgentCdrStats,
  dailyAgentCallStatus,
  getLostCallsToday,
} = require("../controllers/calls/calls");

router.get("/calls-count", getCdrCounts);
router.get("/agent-calls/:agentId", getAgentCdrStats);
router.get("/agent-calls-today/:agentId", dailyAgentCallStatus);
router.get("/lost-calls-today", getLostCallsToday);

module.exports = router;
