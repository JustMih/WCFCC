const Notification = require("../../models/Notification");
const User = require("../../models/User");
const { Op } = require("sequelize");
const Ticket = require("../../models/Ticket");
const { sendEmail } = require('../../services/emailService');

// Create a notification
const createNotification = async (req, res) => {
  try {
    const { category, channel, message, ticket_id } = req.body;
    const userId = req?.user?.userId; // sender

    let assignedUser;

    // Step 1: Determine assignee based on category
    if (category === "Inquiry") {
      assignedUser = await User.findOne({
        where: { role: "focal-person" },
        order: [["id", "ASC"]]
      });
    } else if (
      ["Complaint", "Suggestion", "Compliment", "Social Media"].includes(category)
    ) {
      assignedUser = await User.findOne({
        where: { role: "coordinator" }
      });
    }

    if (!assignedUser) {
      return res.status(404).json({
        message: "No appropriate assignee found for this category."
      });
    }

    // Step 2: Validate required fields
    const missingFields = [];
    if (!ticket_id) missingFields.push("ticket_id");
    if (!userId) missingFields.push("sender_id");
    if (!channel) missingFields.push("channel");
    if (!message) missingFields.push("message");

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required fields.",
        missingFields
      });
    }

    const default_message = `Reminder to ${category} ticket, under your preview`;
    // Step 3: Create the notification
    const notification = await Notification.create({
      ticket_id,
      sender_id: userId,
      recipient_id: assignedUser.id,
      message: default_message,
      comment: message,
      channel,
      status: 'Unread',
      category: category
    });

    // Send email to the recipient
    if (assignedUser.email) {
      let ticketInfo = '';
      if (ticket_id) {
        const ticket = await Ticket.findByPk(ticket_id);
        if (ticket) {
          ticketInfo = `<br/><strong>Ticket Subject:</strong> ${ticket.subject || ''}<br/><strong>Category:</strong> ${ticket.category || ''}`;
        }
      }
      const emailSubject = `New Notification: ${category}`;
      const emailHtmlBody = `
        <p>Dear ${assignedUser.name},</p>
        <p>${default_message}</p>
        <p>${message}</p>
        ${ticketInfo}
        <p>Please log in to the system for more details.</p>
        <p>WCF Customer Care System</p>
      `;
      try {
        // await sendEmail({ to: assignedUser.email, subject: emailSubject, htmlBody: emailHtmlBody });
        await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject: emailSubject, htmlBody: emailHtmlBody });
      } catch (emailError) {
        console.error('Error sending notification email:', emailError.message);
      }
    }

    return res.status(201).json({
      message: "Notification created.",
      notification
    });

  } catch (error) {
    console.error("Error creating notification:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};


// List all notifications for a user
const listNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const notifications = await Notification.findAll({
      where: {
        recipient_id: userId,
        [Op.or]: [
          { status: "unread" },
          { status: " " }
        ]
      },
      
      include: [
        {
          model: Ticket,
          as: 'ticket',
          attributes: ['id', 'ticket_id', 'subject', 'category', 'status', 'description']
        }
      ],
      order: [["created_at", "DESC"]]
    });
    return res.status(200).json({ notifications });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching notifications", error: error.message });
  }
};

// Get single notification with ticket details
const getNotificationById = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findOne({
      where: { id: notificationId },
      include: [
        {
          model: Ticket,
          as: 'ticket',
          attributes: ['id', 'ticket_id', 'subject', 'category', 'status', 'description']
        }
      ]
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ notification });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching notification", error: error.message });
  }
};

// Mark a notification as read
const markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const notification = await Notification.findByPk(notificationId);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }
    notification.status = "read";
    await notification.save();
    return res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error updating notification", error: error.message });
  }
};

// Get unread notification count for a user
const getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await Notification.count({
      where: {
        recipient_id: userId,
        [Op.or]: [{ status: "unread" }, { status: " " }] // Correctly checking both conditions
      }
    });
    return res.status(200).json({ unreadCount: count });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching unread count", error: error.message });
  }
};

// Get notifications by ticket ID
const getNotificationsByTicketId = async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log("Fetching notifications for ticket:", ticketId);

    const notifications = await Notification.findAll({
      where: {
        ticket_id: ticketId
      },
      include: [
        {
          model: Ticket,
          as: 'ticket',
          attributes: ['id', 'ticket_id', 'subject', 'category', 'status', 'description']
        }
      ],
      order: [["created_at", "DESC"]]
    });

    console.log("Found notifications:", notifications.length);
    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("Error fetching ticket notifications:", error);
    return res.status(500).json({ 
      message: "Error fetching ticket notifications", 
      error: error.message 
    });
  }
};

module.exports = {
  createNotification,
  listNotifications,
  markAsRead,
  getUnreadCount,
  getNotificationById,
  getNotificationsByTicketId
};
