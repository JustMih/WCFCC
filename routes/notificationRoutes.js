const express = require('express');
const router = express.Router();
const { 
  createNotification, 
  listNotifications, 
  markAsRead, 
  getUnreadCount 
} = require('../controllers/notifications/notificationController');
const { authMiddleware } = require("../middleware/authMiddleware");

// All routes require authentication
router.use(authMiddleware);

// Create a notification
router.post('/notify',
    authMiddleware,
     createNotification);

// List notifications for a user
router.get('/user/:userId', listNotifications);

// Mark a notification as read
router.patch('/read/:notificationId', markAsRead);

// Get unread notification count for a user
router.get('/unread-count/:userId', getUnreadCount);

module.exports = router; 