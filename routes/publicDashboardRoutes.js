const express = require("express");
const router = express.Router();
const {
  getPublicDashboardData,
  getPublicDashboardCallStats,
} = require("../controllers/publicDashboard/publicDashboardController");

// Public route - no authentication required
router.get("/dashboard", getPublicDashboardData);
router.get("/dashboard-call-stats", getPublicDashboardCallStats);

module.exports = router;

