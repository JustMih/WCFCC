const express = require("express");
const {
    getFocalPersonTickets,
    assignTicket,
    reassignTicket,
    completeAssignment,
    getFocalPersonDashboardCounts
} = require("../controllers/focal_person/focalPersonController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

const router = express.Router();

// Middleware to check if user is a focal person for Claims section
const isClaimsFocalPerson = async (req, res, next) => {
  try {
    if (req.user.section !== 'Claims') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Must be a focal person for Claims section.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking user section',
      error: error.message
    });
  }
};

// Get all focal person tickets with filters and pagination
router.get("/new-tickets", 
    authMiddleware, 
    roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person"]), 
    getFocalPersonTickets
);

// Get dashboard counts
router.get("/dashboard-counts", 
    authMiddleware, 
    roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person"]), 
    getFocalPersonDashboardCounts
);

// Assign a ticket to an officer
router.post("/focal-person-tickets/:ticketId/assign", 
    authMiddleware, 
    roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person"]), 
    assignTicket
);

// Reassign a ticket to a different officer
router.post("/focal-person-tickets/:ticketId/reassign", 
    authMiddleware, 
    roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person"]), 
    reassignTicket
);



// Complete an assignment
router.post("/focal-person-tickets/:ticketId/complete", 
    authMiddleware, 
    roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person"]), 
    completeAssignment
);



module.exports = router;


