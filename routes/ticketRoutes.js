const express = require("express");
const path = require("path");
const fs = require("fs");
const {
  createTicket, getTickets, getTicketCounts, getOpenTickets, getInprogressTickets, getAssignedTickets,
  getCarriedForwardTickets, getClosedTickets, getOverdueTickets, getAllTickets, getAllCustomersTickets, 
  rateComplaint, updateComplaintProgress, reviewComplaint, convertToInquiry, searchComplaints,
  mockComplaintWorkflow, searchByPhoneNumber, searchByTicketId, getTicketById, closeReviewerTicket, getClaimsWithValidNumbers,
  assignTicket, getAllAttendee, closeTicket, getTicketAssignments, getTicketClarifications, getAssignedOfficers, getTicketMentionUsers,
  getAssignedNotifiedTickets, getDashboardCounts, getInProgressAssignments, reverseTicket,
  getOpenTicketsCount, getAssignedTicketsCount, getInprogressTicketsCount, getCarriedForwardTicketsCount, getClosedTicketsCount, getOverdueTicketsCount,
  getEscalatedTicketsForUser, getEverAssignedTickets, getEverAssignedTicketsCount, getAllTicketsCount,
  forwardToDirectorGeneral, getUserAgingStats, reassignTicket, reverseComplaint, approveAndForwardToReviewer, reverseAndAssignToReviewer, managerAttendMajor, managerSendToDirector, updateReversedTicketDetails, getWorkflowTickets
} = require("../controllers/ticket/ticketController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();
const { Op } = require("sequelize");

// Import enhanced multer configuration
const { 
  uploadSingle, 
  uploadMultiple, 
  uploadEvidence, 
  handleMulterError,
  ticketAttachmentsDirectory 
} = require("../config/multerConfig");

// Create User route
router.post(
  "/create-ticket",
  authMiddleware,
  // roleMiddleware(["agent", "attendee", "super-admin", "reviewer"]),
  createTicket
);

// Get User ticket created route
router.get(
  "/list/:userId",
  authMiddleware,
  roleMiddleware(["agent", "attendee","super-admin"]),
  getTickets
);

// Get User ticket created route
router.get(
  "/open/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin", "reviewer"]),
  getOpenTickets
);

// Get User ticket created route
router.get(
  "/assigned/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin"]),
  getAssignedTickets
);

// Get inprogress ticket 
router.get(
  "/in-progress/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin"]),
  getInprogressTickets
);


// Get carried forward ticket 
router.get(
  "/carried-forward/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin"]),
  getCarriedForwardTickets
);

// Get closed ticket 
router.get(
  "/closed/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin"]),
  getClosedTickets
);

// Get overdue ticket 
router.get(
  "/overdue/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin"]),
  getOverdueTickets
);

// Get total ticket 
router.get(
  "/all/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee","super-admin"]),
  getAllTickets
);

router.get(
  "/count/:userId",
  authMiddleware,
  // roleMiddleware(["agent", "attendee", "super-admin", "reviewer", "focal-person", "claim-focal-person", "compliance-focal-person"]),
  getTicketCounts
);

// Get workflow tickets (tickets with workflow_path set)
router.get(
  "/workflow-tickets",
  authMiddleware,
  getWorkflowTickets
);

// Get attachment file
router.get('/attachment/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(ticketAttachmentsDirectory, filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'Attachment not found' });
  }
  
  // Serve the file
  res.download(filePath);
});

// Get all customer tickets
router.get(
  "/all-customer-tickets",
  authMiddleware,
  // roleMiddleware(["agent", "attendee", "super-admin", "reviewer"]),
  getAllCustomersTickets
);

// Mock complaint workflow route (for testing)
router.post(
  '/complaints/:ticketId/mock',
  authMiddleware,
  mockComplaintWorkflow
);

// Search tickets by phone number
router.get(
  "/search-by-phone/:phoneNumber",
  authMiddleware,
  // roleMiddleware(["agent", "attendee", "super-admin", "reviewer"]),
  searchByPhoneNumber
);

// Search ticket by ticket_id (formatted ticket number like WCF-CC-20251226-000002)
router.get(
  "/search-by-ticket-id/:ticketId",
  authMiddleware,
  searchByTicketId
);

// Get ticket by ID
router.get('/:ticketId', 
  authMiddleware,
  // roleMiddleware(["agent", "attendee", "super-admin", "reviewer", "focal-person", "claim-focal-person", "compliance-focal-person"]),
  getTicketById
);

// Route for reviewer to close tickets
router.post('/:ticketId/close-reviewer-ticket', closeReviewerTicket);

// Add after other ticket routes
router.post(
  '/:ticketId/assign',
  authMiddleware,
  // roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person", 'super-admin', 'reviewer']),
  assignTicket
);

// Add reassign route
router.post(
  '/:ticketId/reassign',
  authMiddleware,
  // roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person", 'super-admin', 'reviewer']),
  reassignTicket
);

// Add after other ticket routes
router.get(
  '/admin/attendee',
  authMiddleware,
  // roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person", 'super-admin', 'reviewer', 'admin']),
  getAllAttendee
);


// Add after other ticket routes
router.post(
  '/:ticketId/close',
  authMiddleware,
  // roleMiddleware(['agent', 'head-of-unit','attendee', 'super-admin', 'reviewer', "focal-person", "claim-focal-person", "compliance-focal-person", "manager"]),
  uploadSingle,
  handleMulterError,
  closeTicket
);

router.get('/:ticketId/assignments', authMiddleware, getTicketAssignments);
router.get('/:ticketId/clarifications', authMiddleware, getTicketClarifications);
router.get('/:ticketId/assigned-officers', authMiddleware, getAssignedOfficers);
router.get('/:ticketId/mention-users', authMiddleware, getTicketMentionUsers);

// Get tickets assigned to user and notified
router.get(
  "/assigned-notified/:userId",
  authMiddleware,
  getAssignedNotifiedTickets
);

router.get(
  "/dashboard-counts/:userId",
  authMiddleware,
  // roleMiddleware(['agent', 'attendee', 'super-admin', 'reviewer', "focal-person", "claim-focal-person", "compliance-focal-person"]),
  getDashboardCounts
);

router.get(
  '/in-progress',
  authMiddleware,
  // roleMiddleware(['super-admin', 'reviewer', 'focal-person', 'claim-focal-person', 'compliance-focal-person']),
  getInProgressAssignments
);

router.get(
  '/assignments/in-progress',
  authMiddleware,
  // roleMiddleware(['attendee','agent','super-admin', 'reviewer', 'focal-person', 'claim-focal-person', 'compliance-focal-person']),
  getInProgressAssignments
);

// Add after other ticket routes
router.post(
  '/:ticketId/reverse',
  authMiddleware,
  uploadSingle,
  handleMulterError,
  reverseTicket
);

// Add reverse-complaint route
router.post(
  '/:ticketId/reverse-complaint',
  authMiddleware,
  uploadSingle,
  handleMulterError,
  reverseComplaint
);

// Route for director/head-of-unit to forward major complaint to Director General
router.post(
  '/:ticketId/forward-to-dg',
  authMiddleware,
  roleMiddleware(['director', 'head-of-unit']),
  uploadSingle,
  handleMulterError,
  forwardToDirectorGeneral
);

// Route for Director General to approve and forward to reviewer
router.post(
  '/:ticketId/approve-and-forward',
  authMiddleware,
  roleMiddleware(['director-general']),
  approveAndForwardToReviewer
);

// Route for Director General to reverse and assign to reviewer
router.post(
  '/:ticketId/reverse-and-assign',
  authMiddleware,
  roleMiddleware(['director-general']),
  reverseAndAssignToReviewer
);


router.get('/count/open/:userId', getOpenTicketsCount);
router.get('/count/assigned/:userId', getAssignedTicketsCount);
router.get('/count/inprogress/:userId', getInprogressTicketsCount);
router.get('/count/carried-forward/:userId', getCarriedForwardTicketsCount);
router.get('/count/closed/:userId', getClosedTicketsCount);
router.get('/count/overdue/:userId', getOverdueTicketsCount);

// Get user aging statistics
router.get(
  '/aging-stats/:userId',
  authMiddleware,
  getUserAgingStats
);

// Route for manager to attend major complaints and send to Head of Unit
router.post(
  '/:ticketId/manager-attend-major',
  authMiddleware,
  roleMiddleware(['manager']),
  managerAttendMajor
);

// Route for manager to send to Director when receiving from Attendee (Major Complaint Directorate)
router.post(
  '/:ticketId/manager-send-to-director',
  authMiddleware,
  roleMiddleware(['manager']),
  uploadSingle,
  handleMulterError,
  managerSendToDirector
);

// General close ticket route for all roles (except reviewers who have their own route)
router.post(
  '/:ticketId/close',
  authMiddleware,
  uploadSingle,
  handleMulterError,
  closeTicket
);

// router.get('/ticket/escalated/:userId', getEscalatedTicketsForUser);
// router.get('/ticket/ever-assigned/:userId', getEverAssignedTickets);
// router.get('/ticket/ever-assigned-count/:userId', getEverAssignedTicketsCount);
router.get('/all-count/:userId', getAllTicketsCount);

// Route for updating reversed ticket details (subject and section)
router.post(
  '/:ticketId/update-reversed-details',
  authMiddleware,
  updateReversedTicketDetails
);

module.exports = router;