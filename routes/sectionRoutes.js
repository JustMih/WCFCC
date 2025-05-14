const express = require("express");
const {
  getByFunctionId, getAllFunctionData, getAllFunctionDetails, getAllFunction
} = require("../controllers/section/functionsDataController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();
const { Op } = require("sequelize");

// Get function data of relation fuction and sections
router.get(
  "/functions-data/:functionId",
  authMiddleware,
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  getAllFunctionDetails
);


// Get function data of relation fuction and sections
router.get(
  "/functions-data",
  authMiddleware,
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  getAllFunctionData
);

router.get(
  "/units-data",
  authMiddleware,
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  getAllFunction
);

module.exports = router;
