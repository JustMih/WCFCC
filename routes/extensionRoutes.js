const express = require("express");
const router = express.Router();
const {
  addExtension,
  getAllExtensions,
  getExtensionById,
  updateExtension,
  deleteExtension,
  activateExtension,
  deactivateExtension,
} = require("../controllers/extensions/extensionController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

// Define extension routes
router.post(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  addExtension
);
router.get(
  "/",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getAllExtensions
);
router.get(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  getExtensionById
);
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  updateExtension
);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteExtension
);
router.patch(
  "/:id/activate",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  activateExtension
);
router.patch(
  "/:id/deactivate",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deactivateExtension
);

module.exports = router;
