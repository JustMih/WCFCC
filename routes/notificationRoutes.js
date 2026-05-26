const express = require('express');
const router = express.Router();
const { 
  createNotification, 
  listNotifications, 
  markAsRead, 
  getUnreadCount,
  getUnreadTicketsCount,
  getNotificationById,
  getNotificationsByTicketId,
  getNotifiedTicketsCount,
  getNotificationsByTicketAndRecipient,
  getAllNotificationsForReport
} = require('../controllers/notifications/notificationController');
const { authMiddleware } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authMiddleware);

// Create a notification
router.post('/notify',
    authMiddleware,
     createNotification);

// Get all notifications for a user (for reports - includes read and unread)
// This must come before /user/:userId to avoid route conflict
router.get('/all/:userId',
  authMiddleware,
  getAllNotificationsForReport);

// List notifications for a user (unread only)
router.get('/user/:userId',
  authMiddleware,
  listNotifications);

// Mark a notification as read
router.patch('/read/:notificationId', 
  authMiddleware,
  markAsRead);

// Get unread notification count for a user (all notifications)
router.get('/unread-count/:userId', 
  authMiddleware,
  getUnreadCount);

// Get unread tickets count for sidebar (distinct tickets)
router.get('/unread-tickets-count/:userId', 
  authMiddleware,
  getUnreadTicketsCount);

// Get notified tickets count for a user
router.get('/notified-tickets-count/:userId', 
  authMiddleware,
  getNotifiedTicketsCount);

// Get notifications by ticket ID
router.get('/ticket/:ticketId', getNotificationsByTicketId);

router.get('/ticket/:ticketId/user/:userId', 
  getNotificationsByTicketAndRecipient);

// Get single notification (must be last to avoid matching other routes)
router.get('/:notificationId', getNotificationById);

module.exports = router; 