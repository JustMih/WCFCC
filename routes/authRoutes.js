const express = require("express");
const { login, logout } = require("../controllers/auth/authController");
const router = express.Router();

// Login route
router.post("/login", login);

// Logout route
router.post("/logout", logout);

module.exports = router;
