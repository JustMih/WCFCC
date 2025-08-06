const express = require("express");
const { getTicketStatusExternal } = require("../controllers/external/externalController");
const router = express.Router();

// External API endpoint for ticket status lookup
// This endpoint is public and doesn't require authentication
// Usage: GET /api/external/ticket-status/:ticketId
router.get("/ticket-status/:ticketId", getTicketStatusExternal);

module.exports = router; 