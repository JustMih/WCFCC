const express = require("express");
const {
  login,
  logout,
  getAgentOnlineTime,
  getTotalAgentStatus,
  getAgentLoginTime,
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

// Route to get the login time of the agent
router.post("/login-time", getAgentLoginTime);

module.exports = router;
