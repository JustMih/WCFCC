const express = require("express");
const { getTicketStatusExternal } = require("../controllers/external/externalController");
// const apiKeyAuth = require("../middleware/apiKeyAuth"); // Commented out - no auth required
const { externalApiLimiter } = require("../middleware/rateLimiter");
const externalCorsOptions = require("../middleware/corsConfig");
// const { validateTicketSearch, handleValidationErrors } = require("../middleware/inputValidation"); // Removed - validation in controller
const cors = require('cors');
const router = express.Router();

// Apply CORS to all external routes
router.use(cors(externalCorsOptions));

// External API endpoint for ticket status lookup
// This endpoint is public (no authentication required) but has rate limiting
// CORS protection controls which domains can access
// Usage: POST /api/external/ticket-status
// Body: { "phone_number": "255123456789" } OR { "ticket_number": "TKT123456" } OR both
router.post("/ticket-status", 
  // apiKeyAuth,            // Removed - no authentication required
  externalApiLimiter,    // Rate limiting
  // validateTicketSearch,  // Removed - validation in controller
  // handleValidationErrors, // Removed - validation in controller
  getTicketStatusExternal // Main function with built-in validation
);

module.exports = router; 