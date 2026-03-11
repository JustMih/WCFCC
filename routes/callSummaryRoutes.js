const express = require("express");
const router = express.Router();
const {
  getCallSummary,
  getInboundOutboundSummary,
} = require("../controllers/calls/callSummary");

// Call summary routes for dashboards
router.get("/call-summary", getCallSummary);
router.get("/call-summary-by-direction", getInboundOutboundSummary);

module.exports = router;

