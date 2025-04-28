const express = require("express");
const {
    getAllCoordinatorComplaints, rateTickets, convertOrForwardTicket
} = require("../controllers/coordinator/coordinatorController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();
const { Op } = require("sequelize");


// Get ticket complaints created route
router.get(
  "/complaints",
  authMiddleware,
  roleMiddleware(["coordinator", "super-admin"]),
  getAllCoordinatorComplaints
);

// update ticket complaints rating if minor or major
router.post(
  "/:id/rate",
  authMiddleware,
  roleMiddleware(["coordinator"]),
  rateTickets
);

// update ticket complaints created route
router.post(
  "/:id/convert-or-forward-ticket",
  authMiddleware,
  roleMiddleware(["coordinator"]),
  convertOrForwardTicket
);


module.exports = router;