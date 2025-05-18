const Notification = require('../../models/Notification');
const { Op } = require('sequelize');

// Create a notification
const createNotification = async (req, res) => {
  try {
    const { ticket_id, recipient_id, message, channel } = req.body;
    if (!ticket_id || !recipient_id || !message || !channel) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    const notification = await Notification.create({
      ticket_id,
      recipient_id,
      message,
      channel,
      status: 'unread'
    });
    return res.status(201).json({ message: 'Notification created', notification });
  } catch (error) {
    return res.status(500).json({ message: 'Error creating notification', error: error.message });
  }
};

// List all notifications for a user
const listNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = await Notification.findAll({
      where: { recipient_id: userId },
      order: [['created_at', 'DESC']]
    });
    return res.status(200).json({ notifications });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

// Mark a notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findByPk(notificationId);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    notification.status = 'read';
    await notification.save();
    return res.status(200).json({ message: 'Notification marked as read' });
  } catch (error) {
    return res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
};

// Get unread notification count for a user
const getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await Notification.count({
      where: { recipient_id: userId, status: 'unread' }
    });
    return res.status(200).json({ unreadCount: count });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching unread count', error: error.message });
  }
};

module.exports = {
  createNotification,
  listNotifications,
  markAsRead,
  getUnreadCount
}; 