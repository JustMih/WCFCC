const express = require("express");
const { body } = require("express-validator");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

// Import controllers
const {
  getAllReportTo,
  getReportToById,
  createReportTo,
  updateReportTo,
  deleteReportTo,
} = require("../controllers/lookup-tables/reportToController");

const {
  getAllDesignations,
  getDesignationById,
  createDesignation,
  updateDesignation,
  deleteDesignation,
} = require("../controllers/lookup-tables/designationController");

const {
  getAllUnitSections,
  getUnitSectionById,
  createUnitSection,
  updateUnitSection,
  deleteUnitSection,
} = require("../controllers/lookup-tables/unitSectionController");

const {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
} = require("../controllers/lookup-tables/newRoleController");

const {
  getUserRoles,
  assignRolesToUser,
  addRoleToUser,
  removeRoleFromUser,
  getAllUsersWithRoles,
} = require("../controllers/lookup-tables/userRoleController");

const {
  getAllRelations,
  getRelationById,
  createRelation,
  updateRelation,
  deleteRelation,
} = require("../controllers/lookup-tables/relationController");

const {
  getAllDirectorates,
  getDirectorateById,
  createDirectorate,
  updateDirectorate,
  deleteDirectorate,
} = require("../controllers/lookup-tables/directorateController");

const {
  getAllUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
} = require("../controllers/lookup-tables/unitController");

const {
  getAllSubjects,
  getSubjectById,
  createSubject,
  updateSubject,
  deleteSubject,
} = require("../controllers/lookup-tables/subjectController");

const router = express.Router();

// Validation middleware
const validateNameAndDescription = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage("Name is required and must be between 1 and 255 characters"),
  body("description")
    .optional()
    .isLength({ max: 1000 })
    .withMessage("Description must be less than 1000 characters"),
];

const validateRoleIds = [
  body("roleIds")
    .isArray({ min: 1 })
    .withMessage("roleIds must be an array with at least one role ID"),
  body("roleIds.*")
    .isInt({ min: 1 })
    .withMessage("Each role ID must be a positive integer"),
];

const validateRoleId = [
  body("roleId")
    .isInt({ min: 1 })
    .withMessage("roleId must be a positive integer"),
];

const validateUnitId = [
  body("unit_id")
    .isInt({ min: 1 })
    .withMessage("unit_id must be a positive integer"),
];

const validateDirectorateId = [
  body("directorate_id")
    .optional()
    .isInt({ min: 1 })
    .withMessage("directorate_id must be a positive integer"),
];

// Report To routes
router.get("/report-to", authMiddleware, getAllReportTo);
router.get("/report-to/:id", authMiddleware, getReportToById);
router.post(
  "/report-to",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  createReportTo
);
router.put(
  "/report-to/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  updateReportTo
);
router.delete(
  "/report-to/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteReportTo
);

// Designation routes
router.get("/designations", authMiddleware, getAllDesignations);
router.get("/designations/:id", authMiddleware, getDesignationById);
router.post(
  "/designations",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  createDesignation
);
router.put(
  "/designations/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  updateDesignation
);
router.delete(
  "/designations/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteDesignation
);

// Unit Section routes
router.get("/unit-sections", authMiddleware, getAllUnitSections);
router.get("/unit-sections/:id", authMiddleware, getUnitSectionById);
router.post(
  "/unit-sections",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  createUnitSection
);
router.put(
  "/unit-sections/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  updateUnitSection
);
router.delete(
  "/unit-sections/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteUnitSection
);

// Role routes
router.get("/roles", authMiddleware, getAllRoles);
router.get("/roles/:id", authMiddleware, getRoleById);
router.post(
  "/roles",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  createRole
);
router.put(
  "/roles/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  updateRole
);
router.delete(
  "/roles/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteRole
);

// User Role routes
router.get("/users/:userId/roles", authMiddleware, getUserRoles);
router.get("/users-with-roles", authMiddleware, getAllUsersWithRoles);
router.post(
  "/users/:userId/roles",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateRoleIds,
  assignRolesToUser
);
router.post(
  "/users/:userId/roles/add",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateRoleId,
  addRoleToUser
);
router.delete(
  "/users/:userId/roles/:roleId",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  removeRoleFromUser
);

// Relation routes
router.get("/relations", authMiddleware, getAllRelations);
router.get("/relations/:id", authMiddleware, getRelationById);
router.post(
  "/relations",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  createRelation
);
router.put(
  "/relations/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  updateRelation
);
router.delete(
  "/relations/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteRelation
);

// Directorate routes
router.get("/directorates", authMiddleware, getAllDirectorates);
router.get("/directorates/:id", authMiddleware, getDirectorateById);
router.post(
  "/directorates",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  createDirectorate
);
router.put(
  "/directorates/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  validateNameAndDescription,
  updateDirectorate
);
router.delete(
  "/directorates/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteDirectorate
);

// Unit routes
router.get("/units", authMiddleware, getAllUnits);
router.get("/units/:id", authMiddleware, getUnitById);
router.post(
  "/units",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  [...validateNameAndDescription, ...validateDirectorateId],
  createUnit
);
router.put(
  "/units/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  [...validateNameAndDescription, ...validateDirectorateId],
  updateUnit
);
router.delete(
  "/units/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteUnit
);

// Subject routes
router.get("/subjects", authMiddleware, getAllSubjects);
router.get("/subjects/:id", authMiddleware, getSubjectById);
router.post(
  "/subjects",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  [...validateNameAndDescription, ...validateUnitId],
  createSubject
);
router.put(
  "/subjects/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  [...validateNameAndDescription, validateUnitId[0].optional()],
  updateSubject
);
router.delete(
  "/subjects/:id",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  deleteSubject
);

module.exports = router;
