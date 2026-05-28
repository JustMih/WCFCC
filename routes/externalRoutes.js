const express = require("express");
const { getTicketStatusExternal } = require("../controllers/external/externalController");
const { externalApiLimiter } = require("../middleware/rateLimiter");
const externalCorsOptions = require("../middleware/corsConfig");
const cors = require("cors");
const router = express.Router();

router.use(cors(externalCorsOptions));

// External API endpoint for ticket status lookup
// POST /api/external/ticket-status
// Body: { "phone_number": "255123456789" } OR { "ticket_number": "TKT123456" } OR both
router.post("/ticket-status", externalApiLimiter, getTicketStatusExternal);

module.exports = router;
