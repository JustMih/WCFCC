const express = require("express");
const router = express.Router();
const { getTicketSummary } = require("../controllers/ticket/ticketSummary");

// Ticket summary route for dashboard
router.get("/ticket-summary", getTicketSummary);

module.exports = router;

