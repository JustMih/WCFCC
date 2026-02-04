const express = require("express");
const {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
} = require("../controllers/channel/channelController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const router = express.Router();

// Get all channels
router.get(
  "/",
  authMiddleware,
  getAllChannels
);

// Get channel by ID
router.get(
  "/:id",
  authMiddleware,
  getChannelById
);

// Create Channel (super-admin only)
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  createChannel
);

// Update Channel (super-admin only)
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  updateChannel
);

// Delete Channel (super-admin only)
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  deleteChannel
);

module.exports = router;
