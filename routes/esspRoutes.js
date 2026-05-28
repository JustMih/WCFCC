const express = require("express");
const cors = require("cors");
const { createTicketExternal } = require("../controllers/external/externalController");
const externalApiKeyAuth = require("../middleware/externalApiKeyAuth");
const { externalApiLimiter } = require("../middleware/rateLimiter");
const externalCorsOptions = require("../middleware/corsConfig");

const router = express.Router();

router.use(cors(externalCorsOptions));

// POST /api/essp/create-ticket
// Body: { "payload": { firstName, phoneNumber, category, subject, description, ... } }
router.post(
  "/create-ticket",
  externalApiKeyAuth,
  externalApiLimiter,
  createTicketExternal
);

module.exports = router;
