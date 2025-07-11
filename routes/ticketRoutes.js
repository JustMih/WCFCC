const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  createTicket, getTickets, getTicketCounts, getOpenTickets, getInprogressTickets, getAssignedTickets,
  getCarriedForwardTickets, getClosedTickets, getOverdueTickets, getAllTickets, getAllCustomersTickets, 
  rateComplaint, updateComplaintProgress, reviewComplaint, convertToInquiry, searchComplaints,
  mockComplaintWorkflow, searchByPhoneNumber, getTicketById, closeCoordinatorTicket, getClaimsWithValidNumbers,
  assignTicket, getAllAttendee, closeTicket, getTicketAssignments, getAssignedOfficers,
  getAssignedNotifiedTickets, getDashboardCounts, getInProgressAssignments, reverseTicket,
  getOpenTicketsCount, getAssignedTicketsCount, getInprogressTicketsCount, getCarriedForwardTicketsCount, getClosedTicketsCount, getOverdueTicketsCount,
  getEscalatedTicketsForUser, getEverAssignedTickets, getEverAssignedTicketsCount, getAllTicketsCount
} = require("../controllers/ticket/ticketController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");
const { body } = require('express-validator'); // For validation
const router = express.Router();
const { Op } = require("sequelize");

// Set up multer storage for ticket attachments
const ticketAttachmentsDirectory = path.join(__dirname, "..", "ticket_attachments");
if (!fs.existsSync(ticketAttachmentsDirectory)) {
  fs.mkdirSync(ticketAttachmentsDirectory);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ticketAttachmentsDirectory);
  },
  filename: (req, file, cb) => {
    const fileName = Date.now() + "_" + file.originalname;
    cb(null, fileName);
  },
});

const upload = multer({ storage: storage });

// Create User route
router.post(
  "/create-ticket",
  authMiddleware,
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
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
  // roleMiddleware(["agent", "attendee","super-admin", "coordinator"]),
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
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator", "focal-person", "claim-focal-person", "compliance-focal-person"]),
  getTicketCounts
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
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
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
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator"]),
  searchByPhoneNumber
);

// Get ticket by ID
router.get('/:ticketId', 
  authMiddleware,
  roleMiddleware(["agent", "attendee", "super-admin", "coordinator", "focal-person", "claim-focal-person", "compliance-focal-person"]),
  getTicketById
);

// Route for coordinator to close tickets
router.post('/:ticketId/close-coordinator-ticket', closeCoordinatorTicket);

// Add after other ticket routes
router.post(
  '/:ticketId/assign',
  authMiddleware,
  // roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person", 'super-admin', 'coordinator']),
  assignTicket
);

// Add after other ticket routes
router.get(
  '/admin/attendee',
  authMiddleware,
  // roleMiddleware(["focal-person", "claim-focal-person", "compliance-focal-person", 'super-admin', 'coordinator', 'admin']),
  getAllAttendee
);

// Add after other ticket routes
router.post(
  '/:ticketId/close',
  authMiddleware,
  roleMiddleware(['agent', 'attendee', 'super-admin', 'coordinator', "focal-person", "claim-focal-person", "compliance-focal-person"]),
  upload.single("attachment"),
  closeTicket
);

router.get('/:ticketId/assignments', authMiddleware, getTicketAssignments);
router.get('/:ticketId/assigned-officers', authMiddleware, getAssignedOfficers);

// Get tickets assigned to user and notified
router.get(
  "/assigned-notified/:userId",
  authMiddleware,
  getAssignedNotifiedTickets
);

router.get(
  "/dashboard-counts/:userId",
  authMiddleware,
  // roleMiddleware(['agent', 'attendee', 'super-admin', 'coordinator', "focal-person", "claim-focal-person", "compliance-focal-person"]),
  getDashboardCounts
);

router.get(
  '/in-progress',
  authMiddleware,
  roleMiddleware(['super-admin', 'coordinator', 'focal-person', 'claim-focal-person', 'compliance-focal-person']),
  getInProgressAssignments
);

router.get(
  '/assignments/in-progress',
  authMiddleware,
  // roleMiddleware(['attendee','agent','super-admin', 'coordinator', 'focal-person', 'claim-focal-person', 'compliance-focal-person']),
  getInProgressAssignments
);

// Add after other ticket routes
router.post(
  '/:ticketId/reverse',
  authMiddleware,
  reverseTicket
);


router.get('/count/open/:userId', getOpenTicketsCount);
router.get('/count/assigned/:userId', getAssignedTicketsCount);
router.get('/count/inprogress/:userId', getInprogressTicketsCount);
router.get('/count/carried-forward/:userId', getCarriedForwardTicketsCount);
router.get('/count/closed/:userId', getClosedTicketsCount);
router.get('/count/overdue/:userId', getOverdueTicketsCount);

// router.get('/ticket/escalated/:userId', getEscalatedTicketsForUser);
// router.get('/ticket/ever-assigned/:userId', getEverAssignedTickets);
// router.get('/ticket/ever-assigned-count/:userId', getEverAssignedTicketsCount);
router.get('/all-count/:userId', getAllTicketsCount);

module.exports = router;