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

// Apply authentication middleware to all workflow routes
router.use(authMiddleware);

// Get workflow details for a ticket
router.get('/ticket/:ticketId', getWorkflowDetails);

// Attend to a ticket (mark as in progress)
router.post('/ticket/:ticketId/attend', attendTicket);

// Recommend ticket to next step
router.post('/ticket/:ticketId/recommend', recommendTicket);

// Attend and recommend in one action (for attendee with Minor/Major complaints from head of unit)
router.post('/ticket/:ticketId/attend-and-recommend', require('../controllers/workflow/workflowController').attendAndRecommend);

// Reverse ticket to previous step
router.post('/ticket/:ticketId/reverse', reverseTicket);

// Close ticket (final approval)
router.post('/ticket/:ticketId/close', closeTicket);

module.exports = router; 