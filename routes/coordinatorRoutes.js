const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
    getAllCoordinatorTickets,
    rateTickets,
    convertOrForwardTicket,
    getCoordinatorDashboardCounts,
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
    closeCoordinatorTicket,
} = require("../controllers/coordinator/coordinatorController");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

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

const router = express.Router();

// Get coordinator dashboard counts
router.get('/dashboard-counts/:userId', 
    authMiddleware, 
    roleMiddleware(['coordinator', 'super-admin']), 
    getCoordinatorDashboardCounts
);

// Get open tickets
router.get('/open/:userId',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getOpenTickets
);

// Get assigned tickets
router.get('/assigned/:userId',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getAssignedTickets
);

// Get in-progress tickets
router.get('/in-progress/:userId',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getInprogressTickets
);

// Get carried forward tickets
router.get('/carried-forward/:userId',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getCarriedForwardTickets
);

// Get closed tickets
router.get('/closed/:userId',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getClosedTickets
);

// Get overdue tickets
router.get('/overdue/:userId',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getOverdueTickets
);

// Rate tickets
router.post('/:id/rate',
    authMiddleware,
    roleMiddleware(['coordinator']),
    rateTickets
);

// Convert or forward tickets
router.put('/:id/convert-or-forward-ticket',
    authMiddleware,
    roleMiddleware(['coordinator']),
    convertOrForwardTicket
);

// Add this route for status/category-based ticket fetching
router.get(
    '/tickets',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin', 'focal-person']),
    getTicketsByStatus
  );
  
// Get complaints tickets
router.get('/all-tickets',
    authMiddleware,
    roleMiddleware(['coordinator', 'super-admin']),
    getAllCoordinatorTickets
);

// Rate and register complaint
router.post(
  "/complaints/:ticketId/rate",
  authMiddleware,
  roleMiddleware(['coordinator']),
  rateAndRegisterComplaint
);

// Convert complaint to inquiry
router.post(
  "/complaints/:ticketId/convert",
  authMiddleware,
  roleMiddleware(['coordinator']),
  convertToInquiry
);

// Channel complaint to unit
router.post(
  "/complaints/:ticketId/channel",
  authMiddleware,
  roleMiddleware(['coordinator']),
  channelComplaint
);

// Coordinator closes a ticket
router.post(
  "/:ticketId/close",
  authMiddleware,
  // roleMiddleware(['coordinator']),
  upload.single("attachment"),
  closeCoordinatorTicket
);


module.exports = router;