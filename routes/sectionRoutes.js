const express = require("express");
const {
  getByFunctionId, 
  getAllFunctionData, 
  getAllFunctionDetails, 
  getAllFunction,
  getSectionsMapping,
  getFunctionsMapping,
  getFunctionDataMapping,
  getAllMappings,
  // Section CRUD
  createSection,
  updateSection,
  deleteSection,
  // Function CRUD
  createFunction,
  updateFunction,
  deleteFunction,
  // Function Data CRUD
  createFunctionData,
  updateFunctionData,
  deleteFunctionData,
} = require("../controllers/section/functionsDataController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();
const { Op } = require("sequelize");

// ========== SECTION CRUD ROUTES ==========
router.post(
  "/sections",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  createSection
);

router.put(
  "/sections/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  updateSection
);

router.delete(
  "/sections/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  deleteSection
);

// ========== FUNCTION CRUD ROUTES ==========
router.post(
  "/functions",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  createFunction
);

router.put(
  "/functions/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  updateFunction
);

router.delete(
  "/functions/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  deleteFunction
);

// ========== FUNCTION DATA CRUD ROUTES ==========
router.post(
  "/function-data",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  createFunctionData
);

router.put(
  "/function-data/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  updateFunctionData
);

router.delete(
  "/function-data/:id",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  deleteFunctionData
);

// Get function data of relation fuction and sections
router.get(
  "/functions-data/:functionId",
  authMiddleware,
  //roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  getAllFunctionDetails
);

// Get function data of relation fuction and sections
router.get(
  "/functions-data",
  authMiddleware,
  //roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  getAllFunctionData
);

router.get(
  "/units-data",
  authMiddleware,
  //roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  getAllFunction
);

// Mapping endpoints for superadmin frontend
router.get(
  "/mappings/sections",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  getSectionsMapping
);

router.get(
  "/mappings/functions",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  getFunctionsMapping
);

router.get(
  "/mappings/function-data",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  getFunctionDataMapping
);

router.get(
  "/mappings/all",
  authMiddleware,
  roleMiddleware(["super-admin"]),
  getAllMappings
);

module.exports = router;
