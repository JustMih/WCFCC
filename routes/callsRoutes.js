const express = require("express");
const router = express.Router();
const { getCdrCounts, getAgentCdrStats, dailyAgentCallStatus } = require("../controllers/calls/calls");

router.get("/calls-count", getCdrCounts);
router.get("/agent-calls/:agentId", getAgentCdrStats);
router.get("/agent-calls-today/:agentId", dailyAgentCallStatus);

module.exports = router;