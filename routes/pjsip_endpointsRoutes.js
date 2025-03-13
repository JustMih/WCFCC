const express = require("express");
const router = express.Router();
const {
  createEndpoint,
  getAllEndpoints,
  getEndpointById,
  updateEndpoint,
  deleteEndpoint,
} = require("../controllers/pjsip_endpoints/pjsip_endpointsController");

// Create a new endpoint
router.post("/", createEndpoint);

// Get all endpoints
router.get("/", getAllEndpoints);

// Get endpoint by ID
router.get("/:id", getEndpointById);

// Update endpoint by ID
router.put("/:id", updateEndpoint);

// Delete endpoint by ID
router.delete("/:id", deleteEndpoint);

module.exports = router;
