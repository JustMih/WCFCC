const express = require("express");
const path = require("path");
const fs = require("fs");
const {
    getAllReviewerTickets,
    rateTickets,
    convertOrForwardTicket,
    getReviewerDashboardCounts,
    getOpenTickets,
    getAssignedTickets,
    getInprogressTickets,
    getCarriedForwardTickets,
    getClosedTickets,
    getOverdueTickets,
    getTicketsByStatus,
    rateAndRegisterComplaint,
    convertToInquiry,
    channelComplaint,
    closeReviewerTicket,
} = require("../controllers/reviewer/reviewerController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

// Import enhanced multer configuration
const { 
  uploadSingle, 
  handleMulterError,
  ticketAttachmentsDirectory 
} = require("../config/multerConfig");

// Set up multer storage for ticket attachments
if (!fs.existsSync(ticketAttachmentsDirectory)) {
  fs.mkdirSync(ticketAttachmentsDirectory);
}

const router = express.Router();

// Get reviewer dashboard counts
router.get('/dashboard-counts/:userId', 
    authMiddleware, 
    roleMiddleware(['reviewer', 'super-admin']), 
    getReviewerDashboardCounts
);

// Get open tickets
router.get('/open/:userId',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getOpenTickets
);

// Get assigned tickets
router.get('/assigned/:userId',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getAssignedTickets
);

// Get in-progress tickets
router.get('/in-progress/:userId',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getInprogressTickets
);

// Get carried forward tickets
router.get('/carried-forward/:userId',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getCarriedForwardTickets
);

// Get closed tickets
router.get('/closed/:userId',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getClosedTickets
);

// Get overdue tickets
router.get('/overdue/:userId',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getOverdueTickets
);

// Rate tickets
router.post('/:id/rate',
    authMiddleware,
    roleMiddleware(['reviewer']),
    rateTickets
);

// Convert or forward tickets
router.put('/:id/convert-or-forward-ticket',
    authMiddleware,
    roleMiddleware(['reviewer']),
    convertOrForwardTicket
);

// Add this route for status/category-based ticket fetching
router.get(
    '/tickets',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin', 'focal-person']),
    getTicketsByStatus
  );
  
// Get complaints tickets
router.get('/all-tickets',
    authMiddleware,
    roleMiddleware(['reviewer', 'super-admin']),
    getAllReviewerTickets
);

// Rate and register complaint
router.post(
  "/complaints/:ticketId/rate",
  authMiddleware,
  roleMiddleware(['reviewer']),
  rateAndRegisterComplaint
);

// Convert complaint to inquiry
router.post(
  "/complaints/:ticketId/convert",
  authMiddleware,
  roleMiddleware(['reviewer']),
  convertToInquiry
);

// Channel complaint to unit
router.post(
  "/complaints/:ticketId/channel",
  authMiddleware,
  roleMiddleware(['reviewer']),
  channelComplaint
);

// Reviewer closes a ticket
router.post(
  "/:ticketId/close",
  authMiddleware,
  // roleMiddleware(['reviewer']),
  uploadSingle,
  handleMulterError,
  closeReviewerTicket
);


module.exports = router;