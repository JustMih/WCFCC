const express = require("express");
const { getTicketStatusExternal } = require("../controllers/external/externalController");
const apiKeyAuth = require("../middleware/apiKeyAuth");
const { externalApiLimiter } = require("../middleware/rateLimiter");
const externalCorsOptions = require("../middleware/corsConfig");
const { validateTicketSearch, handleValidationErrors } = require("../middleware/inputValidation");
const cors = require('cors');
const router = express.Router();

// Apply CORS to all external routes
router.use(cors(externalCorsOptions));

// External API endpoint for ticket status lookup
// This endpoint requires API key authentication and has rate limiting
// CORS protection controls which domains can access
// Usage: POST /api/external/ticket-status
// Headers: x-api-key: your-ticket-number-or-phone
// Body: { "phone_number": "255123456789" } OR { "ticket_number": "TKT123456" } OR both
router.post("/ticket-status", 
  apiKeyAuth,            // Check API key (ticket number or phone)
  externalApiLimiter,    // Rate limiting
  validateTicketSearch,  // Validate input
  handleValidationErrors, // Handle validation errors
  getTicketStatusExternal // Main function
);

module.exports = router; 