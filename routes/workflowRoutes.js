const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  getWorkflowDetails,
  attendTicket,
  recommendTicket,
  reverseTicket,
  closeTicket
} = require('../controllers/workflow/workflowController');
const { uploadSingle, handleMulterError } = require('../config/multerConfig');

// Apply authentication middleware to all workflow routes
router.use(authMiddleware);

// Get workflow details for a ticket
router.get('/ticket/:ticketId', getWorkflowDetails);

// Attend to a ticket (mark as in progress) - with optional attachment
router.post('/ticket/:ticketId/attend', uploadSingle, handleMulterError, attendTicket);

// Recommend ticket to next step - with optional attachment
router.post('/ticket/:ticketId/recommend', uploadSingle, handleMulterError, recommendTicket);

// Attend and recommend in one action (for attendee with Minor/Major complaints from head of unit)
router.post('/ticket/:ticketId/attend-and-recommend', uploadSingle, handleMulterError, require('../controllers/workflow/workflowController').attendAndRecommend);

// Reverse ticket to previous step - with optional attachment
router.post('/ticket/:ticketId/reverse', uploadSingle, handleMulterError, reverseTicket);

// Close ticket (final approval) - with optional attachment
router.post('/ticket/:ticketId/close', uploadSingle, handleMulterError, closeTicket);

module.exports = router; 