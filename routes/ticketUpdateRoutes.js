const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { roleMiddleware } = require('../middleware/roleMiddleware');
const {
  addTicketUpdate,
  getTicketUpdates,
  getUserTicketUpdates,
  updateTicketUpdate,
  deleteTicketUpdate,
  deactivateUserUpdates,
  checkUserCanAddUpdate,
  markUpdateAsRead,
  markAllUpdatesAsRead,
  getUnreadUpdatesCount
} = require('../controllers/ticket/ticketUpdateController');

// Check if user can add updates to a ticket
router.get('/can-add/:ticket_id', authMiddleware, checkUserCanAddUpdate);

// Add a new update to a ticket
router.post('/add', authMiddleware, addTicketUpdate);

// Get all updates for a specific ticket
router.get('/ticket/:ticket_id', authMiddleware, getTicketUpdates);

// Get updates for current user on a specific ticket
router.get('/user/:ticket_id', authMiddleware, getUserTicketUpdates);

// Update an existing update
router.put('/:update_id', authMiddleware, updateTicketUpdate);

// Delete an update
router.delete('/:update_id', authMiddleware, deleteTicketUpdate);

// Mark an update as read
router.post('/:update_id/mark-as-read', authMiddleware, markUpdateAsRead);

// Mark all updates for a ticket as read
router.post('/ticket/:ticket_id/mark-all-as-read', authMiddleware, markAllUpdatesAsRead);

// Get unread updates count for a ticket
router.get('/ticket/:ticket_id/unread-count', authMiddleware, getUnreadUpdatesCount);

module.exports = router;
