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
  checkUserCanAddUpdate
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

module.exports = router;
