const express = require("express");
const router = express.Router();
const { spyOnCall, getSpyStatus } = require("../controllers/spyController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { SUPERVISOR_ROLES } = require("../services/supervisorCallControl");
const { getAllLiveCalls } = require("../controllers/livestream/livestreamController");

router.get("/live-calls", getAllLiveCalls);
router.get("/spy-status", authMiddleware, getSpyStatus);
router.post(
  "/spy",
  authMiddleware,
  roleMiddleware(SUPERVISOR_ROLES),
  spyOnCall
);

module.exports = router;
