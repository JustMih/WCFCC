const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const {
  assignComplaint,
  attendComplaint,
  reviewComplaint,
  approveComplaint
} = require('../controllers/complaint/complaintWorkflowController');

// Assign complaint to next person in workflow
router.post(
  '/:ticketId/assign',
  authMiddleware,
  roleMiddleware(['coordinator', 'head-of-unit', 'director']),
  assignComplaint
);

// Attend to complaint (for Attendees)
router.post(
  '/:ticketId/attend',
  authMiddleware,
  roleMiddleware(['attendee']),
  attendComplaint
);

// Review complaint (for Head of Unit/Director)
router.post(
  '/:ticketId/review',
  authMiddleware,
  roleMiddleware(['head-of-unit', 'director']),
  reviewComplaint
);

// Final approval (for DG)
router.post(
  '/:ticketId/approve',
  authMiddleware,
  roleMiddleware(['director-general']),
  approveComplaint
);

module.exports = router; 