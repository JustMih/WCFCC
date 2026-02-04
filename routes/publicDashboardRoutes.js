const express = require("express");
const router = express.Router();
const {
  getPublicDashboardData,
} = require("../controllers/publicDashboard/publicDashboardController");

// Public route - no authentication required
router.get("/dashboard", getPublicDashboardData);

module.exports = router;

