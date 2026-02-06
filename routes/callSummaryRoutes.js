const express = require("express");
const router = express.Router();
const { getCallSummary } = require("../controllers/calls/callSummary");

// Call summary route for dashboard
router.get("/call-summary", getCallSummary);

module.exports = router;

