const express = require("express");
const router = express.Router();
const SpyController = require("../controllers/spy/SpyController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { SUPERVISOR_ROLES } = require("../services/supervisorCallControl");

router.post(
  "/call-control",
  authMiddleware,
  roleMiddleware(SUPERVISOR_ROLES),
  SpyController.callControl
);

module.exports = router;
