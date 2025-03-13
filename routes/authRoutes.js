const express = require("express");
const {
  login,
  logout,
  getAgentOnlineTime,
  getTotalAgentStatus,
} = require("../controllers/auth/authController");
const router = express.Router();

// Login route
router.post("/login", login);

// Logout route
router.post("/logout", logout);

// Route to get the total online time of the agent for today
router.get("/online-time", getAgentOnlineTime);

// Route to get the total online time of all agents for today
router.get("/total-status", getTotalAgentStatus);

module.exports = router;
