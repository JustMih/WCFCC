const express = require("express");
const userRoutes = require("./userRoutes");
const authRoutes = require("./authRoutes");
const extensionRoutes = require("./extensionRoutes");
const amiRoutes = require("./amiRoutes");
const pjsipAuthRoutes = require("./pjsip_authsRoutes");
const pjsipAorsRoutes = require("./pjsip_aorsRoutes");
const pjsipEndpointsRoutes = require("./pjsip_endpointsRoutes");
const adminDashboardRoutes = require("./adminDashboard");
const voiceRoutes = require("./voiceRoutes");
const ivrActionRoutes = require("./ivrActionRoutes");
const router = express.Router();

router.use("/users", userRoutes);
router.use("/auth", authRoutes);
router.use("/extensions", extensionRoutes);
router.use("/ami", amiRoutes);
router.use("/pjsip_auths", pjsipAuthRoutes);
router.use("/pjsip_aors", pjsipAorsRoutes);
router.use("/pjsip_endpoints", pjsipEndpointsRoutes);
router.use("/admin-dashboard", adminDashboardRoutes);
router.use("/ivr", voiceRoutes);
router.use("/ivr-actions", ivrActionRoutes);

module.exports = router;
