const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const {
  assignToAttendee,
  attendAndClose,
  attendAndRecommend,
  uploadEvidence,
  
  // DG actions
  approveAndClose,
  approveAndForward,
  
  // General actions
  reverseTicket,
  reviewAndRecommend
} = require('../controllers/workflow/workflowController');

/**
 * Head of Unit / Supervisor Routes
 */

// Assign ticket to attendee
router.post(
  '/:ticketId/assign-attendee',
  authMiddleware,
  roleMiddleware(['supervisor', 'head-of-unit']),
  assignToAttendee
);

// Head of Unit attends and closes (for minor complaints)
router.post(
  '/:ticketId/attend-and-close',
  authMiddleware,
  roleMiddleware(['supervisor', 'head-of-unit']),
  attendAndClose
);

/**
 * Attendee Routes
 */

// Attendee attends and recommends
router.post(
  '/:ticketId/attend-and-recommend',
  authMiddleware,
  roleMiddleware(['attendee']),
  attendAndRecommend
);

// Upload evidence
router.post(
  '/:ticketId/upload-evidence',
  authMiddleware,
  roleMiddleware(['attendee', 'supervisor', 'head-of-unit', 'director-general']),
  uploadEvidence
);

/**
 * Director General Routes
 */

// DG approves and closes
router.post(
  '/:ticketId/approve-and-close',
  authMiddleware,
  roleMiddleware(['director-general']),
  approveAndClose
);

// DG approves and forwards to coordinator
router.post(
  '/:ticketId/approve-and-forward',
  authMiddleware,
  roleMiddleware(['director-general']),
  approveAndForward
);

/**
 * General Routes
 */

// Reverse ticket to previous step
router.post(
  '/:ticketId/reverse',
  authMiddleware,
  roleMiddleware(['supervisor', 'head-of-unit', 'attendee', 'director-general']),
  reverseTicket
);

// Review and recommend (for Head of Unit/Manager)
router.post(
  '/:ticketId/review-and-recommend',
  authMiddleware,
  roleMiddleware(['supervisor', 'head-of-unit', 'director-general']),
  reviewAndRecommend
);

module.exports = router; 