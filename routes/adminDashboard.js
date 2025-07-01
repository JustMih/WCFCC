const express = require("express");
const {
  getAllAgent,
  getAllAdmin,
  getAllSupervisor,
  getAllAttendee,
  getAllCoordinator,
  getAllManager,
  getAllDirectorGeneral,
  getAllDirectorFocalPerson,
} = require("../controllers/admin-dashboard/adminDashboard");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const router = express.Router();

router.get(
  "/agents",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllAgent
);

router.get(
  "/admins",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllAdmin
);

router.get(
  "/supervisor",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllSupervisor
);

router.get(
  "/attendee",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllAttendee
);

router.get(
  "/coordinator",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllCoordinator
);

router.get(
  "/manager",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllManager
);

router.get(
  "/director-general",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllDirectorGeneral
);

router.get(
  "/focal-person",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllDirectorFocalPerson
);

module.exports = router;
