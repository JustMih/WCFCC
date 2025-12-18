const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const {
  sendMessage,
  getTicketMessages,
  markAllMessagesAsRead,
  getUnreadMessagesCount
} = require('../controllers/ticket/ticketChartController');

// Send a new message to a ticket
router.post('/ticket/:ticket_id', authMiddleware, sendMessage);

// Get all messages for a specific ticket
router.get('/ticket/:ticket_id', authMiddleware, getTicketMessages);

// Mark all messages for a ticket as read
router.post('/ticket/:ticket_id/mark-all-as-read', authMiddleware, markAllMessagesAsRead);

// Get unread messages count for a ticket
router.get('/ticket/:ticket_id/unread-count', authMiddleware, getUnreadMessagesCount);

module.exports = router;

