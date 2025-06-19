const express = require('express');
const router = express.Router();
const { authMiddleware, checkRole } = require('../../middleware/auth');
const {
  getFocalPersonTickets,
  updateFocalPersonTicket,
  closeFocalPersonTicket,
  getFocalPersonDashboardCounts,
  assignTicket,
  reassignTicket
} = require('../../controllers/focal_person/FocalPersonController');
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

// Middleware to check if user is a focal person for Claims section
const isClaimsFocalPerson = async (req, res, next) => {
  try {
    if (req.user.role !== 'focal_person' || req.user.section !== 'Claims') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Must be a focal person for Claims section.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking user role',
      error: error.message
    });
  }
};

// Get dashboard counts
router.get('/dashboard-counts',
  authMiddleware,
  isClaimsFocalPerson,
  getFocalPersonDashboardCounts
);

// Get all focal person tickets
router.get('/focal-person-tickets',
  authMiddleware,
  isClaimsFocalPerson,
  getFocalPersonTickets
);

// Assign ticket to attendee
router.post('/focal-person-tickets/:ticketId/assign',
  authMiddleware,
  isClaimsFocalPerson,
  assignTicket
);

// Reassign ticket to different attendee
router.post('/focal-person-tickets/:ticketId/reassign',
  authMiddleware,
  isClaimsFocalPerson,
  reassignTicket
);

// Update a focal person ticket
router.put('/focal-person-tickets/:ticketId',
  authMiddleware,
  isClaimsFocalPerson,
  updateFocalPersonTicket
);

// Close a focal person ticket
router.post('/focal-person-tickets/:ticketId/close',
  authMiddleware,
  isClaimsFocalPerson,
  closeFocalPersonTicket
);

module.exports = router; 