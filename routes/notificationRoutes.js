const express = require('express');
const router = express.Router();
const { 
  createNotification, 
  listNotifications, 
  markAsRead, 
  getUnreadCount,
  getNotificationById,
  getNotificationsByTicketId,
  getNotifiedTicketsCount
} = require('../controllers/notifications/notificationController');
const { authMiddleware } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authMiddleware);

// Create a notification
router.post('/notify',
    authMiddleware,
     createNotification);

// List notifications for a user
router.get('/user/:userId',
  authMiddleware,
  listNotifications);

// Mark a notification as read
router.patch('/read/:notificationId', 
  authMiddleware,
  markAsRead);

// Get unread notification count for a user
router.get('/unread-count/:userId', 
  authMiddleware,
  getUnreadCount);

// Get single notification
router.get('/:notificationId', getNotificationById);

// Get notifications by ticket ID
router.get('/ticket/:ticketId', getNotificationsByTicketId);

// Get notified tickets count for a user
router.get('/notified-tickets-count/:userId', 
  authMiddleware,
  getNotifiedTicketsCount);

module.exports = router; 