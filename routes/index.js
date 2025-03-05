const express = require("express");
const userRoutes = require("./userRoutes");
const authRoutes = require("./authRoutes");
const extensionRoutes = require("./extensionRoutes");
const router = express.Router();

router.use("/users", userRoutes);
router.use("/auth", authRoutes);
router.use("/extensions", extensionRoutes);

module.exports = router;
