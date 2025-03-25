const express = require("express");
const {
  createUser,
  deleteUser,
  activateUser,
  deactivateUser,
  updateUser,
  resetUserPassword,
  getAllUsers,
  getAgents,
  getAgentOffline,
  getAgentOnline,
  getAgentActive,
  getAgentForcePause,
  getAgentIdle,
  getAgentMission,
  getAgentPause,
  GetAgentLogs,
  getSupervisor,
  getMessage,
} = require("../controllers/users/userController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();

// Create User route
router.post(
  "/create-user",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  createUser
);

// Get all users
router.get(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllUsers
);;


router.get(
  "/messages/:user1/:user2",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "agent", "supervisor"]),
  getMessage
);


router.get(
  "/supervisor",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "agent"]),
  getSupervisor
);

router.get(
  "/agents",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgents
);

router.get(
  "/agents-online",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentOnline
);

router.get(
  "/agents-offline",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentOffline
);

router.get(
  "/agents-active",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentActive
);

router.get(
  "/agents-force-pause",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentForcePause
);

router.get(
  "/agents-pause",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentPause
);

router.get(
  "/agents-idle",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentIdle
);

router.get(
  "/agents-mission",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  getAgentMission
);

router.get(
  "/:userId/agents-logs",
  authMiddleware,
  roleMiddleware(["admin", "super-admin", "supervisor"]),
  GetAgentLogs
);

// Delete User route
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteUser
);

// Activate User route
router.put(
  "/:id/activate",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  activateUser
);

// Deactivate User route
router.put(
  "/:id/deactivate",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deactivateUser
);

// Update User route
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  [
    body("email").optional().isEmail().withMessage("Invalid email address"),
    body("name")
      .optional()
      .isLength({ min: 3 })
      .withMessage("Name must be at least 3 characters"),
    body("password")
      .optional()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
  ],
  updateUser
);

// Reset Password route
router.put(
  "/:id/reset-password",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  resetUserPassword
);

module.exports = router;
