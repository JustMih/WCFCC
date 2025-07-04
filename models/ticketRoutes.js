const express = require("express");
const {
  createTicket, getTickets, getTicketCounts, getOpenTickets, getInprogressTickets, getAssignedTickets,
  getCarriedForwardTickets, getClosedTickets, getOverdueTickets, getAllTickets, getAllCustomersTickets
} = require("../controllers/ticket/ticketController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();
const { Op } = require("sequelize");

// Create User route
router.post(
  "/create-ticket",
  authMiddleware,
  roleMiddleware(["agent", "super-admin", "coordinator"]),
  createTicket
);

// Get User ticket created route
router.get(
  "/list/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getTickets
);

// Get User ticket created route
router.get(
  "/open/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getOpenTickets
);

// Get User ticket created route
router.get(
  "/assigned/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getAssignedTickets
);

// Get inprogress ticket 
router.get(
  "/in-progress/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getInprogressTickets
);


// Get carried forward ticket 
router.get(
  "/carried-forward/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getCarriedForwardTickets
);

// Get closed ticket 
router.get(
  "/closed/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getClosedTickets
);

// Get overdue ticket 
router.get(
  "/overdue/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getOverdueTickets
);

// Get total ticket 
router.get(
  "/all/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getAllTickets
);

router.get(
  "/count/:userId",
  authMiddleware,
  roleMiddleware(["agent","super-admin"]),
  getTicketCounts
);

// Get all customer tickets
router.get(
  "/all-customer-tickets",
  authMiddleware,
  roleMiddleware(["agent", "super-admin", "coordinator"]),
  getAllCustomersTickets
);

module.exports = router;