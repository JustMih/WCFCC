const Notification = require("../../models/Notification");
const User = require("../../models/User");
const { Op } = require("sequelize");
const Ticket = require("../../models/Ticket");
const { sendEmail, sendEmailNonBlocking, renderEmailCard } = require("../../services/emailService");
const { Sequelize } = require("sequelize");

function isHandoverNotification(n) {
  const msg = (n.message || "").toLowerCase();
  const cat = (n.category || "").toLowerCase();
  return (
    cat === "handover" ||
    msg.startsWith("handover:") ||
    (msg.includes("handed over") && msg.includes("to you"))
  );
}

function shouldIncludeUnreadNotification(n, userId) {
  if (isHandoverNotification(n)) {
    return true;
  }

  if (!n.ticket) {
    return false;
  }

  const messageText = (n.message || "").toLowerCase();
  const isTaggedNotification = messageText.includes("mentioned you");

  if (isTaggedNotification) {
    return true;
  }

  const ticketStatus = n.ticket.status || "";
  const isReversedTicket = ticketStatus.toLowerCase() === "reversed";

  if (isReversedTicket) {
    const isForCurrentUser = String(n.recipient_id) === String(userId);
    const isUnread = n.status === "unread" || n.status === " ";
    return (
      isForCurrentUser &&
      isUnread &&
      (messageText.includes("reversed back to you") ||
        messageText.includes("reversed to you") ||
        messageText.includes("reassigned to focal person") ||
        (messageText.includes("has been reversed") && messageText.includes("to")))
    );
  }

  return true;
}

// Create a notification
const createNotification = async (req, res) => {
  try {
    const { category, channel, message, ticket_id, recipient_id } = req.body;
    const userId = req?.user?.userId; // sender

    // Step 1: Validate required fields
    const missingFields = [];
    if (!ticket_id) missingFields.push("ticket_id");
    if (!userId) missingFields.push("sender_id");
    if (!channel) missingFields.push("channel");
    if (!message || message.trim() === "") missingFields.push("message");

    // Step 2: Fetch the recipient user (by ID if provided, else fallback to role)
    let recipientUser = null;
    if (recipient_id) {
      recipientUser = await User.findByPk(recipient_id);
      if (!recipientUser) {
        return res.status(404).json({ message: "Recipient user not found." });
      }
    } else if (ticket_id) {
      // Fallback: use assigned_to_id from ticket
      const ticket = await Ticket.findByPk(ticket_id);
      if (ticket && ticket.assigned_to_id) {
        recipientUser = await User.findByPk(ticket.assigned_to_id);
      }
      if (!recipientUser) {
        return res
          .status(404)
          .json({ message: "Recipient user not found for this ticket." });
      }
    } else {
      return res.status(400).json({
        message: "recipient_id or ticket_id with assigned_to_id is required.",
      });
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required fields.",
        missingFields,
      });
    }

    // Step 3: Fetch ticket info (optional, for email)
    let ticket = null;
    if (ticket_id) {
      ticket = await Ticket.findByPk(ticket_id);
    }

    const default_message = `Reminder to ${category} ticket, under your preview`;
    console.log("user notified", recipientUser.id);
    // Step 4: Create the notification
    const notification = await Notification.create({
      ticket_id,
      sender_id: userId,
      recipient_id: recipientUser.id,
      message: default_message,
      comment: message,
      channel,
      status: "unread",
      category: category,
    });

    // Step 5: Send email to the recipient
    if (recipientUser.email) {
      const emailSubject = `New Notification: ${category}`;
      const bodyHtml = `
        <p style="font-size: 1.1rem; color: #333;">Dear <strong>${
          recipientUser.full_name
        }</strong>,</p>
        <p style="font-size: 1.05rem; color: #333;">${default_message}</p>
        <p style="font-size: 1.05rem; color: #333;">${message}</p>
      `;
      const detailsHtml = `
        <p style="font-size: 1rem; color: #555;"><strong>Ticket Subject:</strong> ${
          ticket ? ticket.subject : ""
        }</p>
        <p style="font-size: 1rem; color: #555;"><strong>Category:</strong> ${
          ticket ? ticket.category : ""
        }</p>
        <p style="font-size: 0.95rem; color: #888; margin-top: 32px;">Please log in to the system for more details.</p>
      `;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      // Send email in background to avoid blocking
      sendEmailNonBlocking({ to: recipientUser.email, subject: emailSubject, htmlBody: emailHtmlBody });
    }

    return res.status(201).json({
      message: "Notification created.",
      notification,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// List all notifications for a user (exclude reversed tickets)
const listNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    // Get all notifications first (including reversed tickets)
    const allNotifications = await Notification.findAll({
      where: {
        recipient_id: userId,
        [Op.or]: [{ status: "unread" }, { status: " " }],
      },
      attributes: [
        "id",
        "ticket_id",
        "sender_id",
        "recipient_id",
        "message",
        "channel",
        "status",
        "comment",
        "category",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: [
            "id",
            "ticket_id",
            "subject",
            "category",
            "status",
            "description",
          ],
          required: false,
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const notifications = allNotifications.filter((n) =>
      shouldIncludeUnreadNotification(n, userId)
    );
    
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
          as: "ticket",
          attributes: [
            "id",
            "ticket_id",
            "subject",
            "category",
            "status",
            "description",
          ],
        },
      ],
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

// Get unread notification count for a user (count all unread notifications - exclude reversed tickets)
const getUnreadCount = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // First get all unread notifications with their tickets
    const notifications = await Notification.findAll({
      where: {
        recipient_id: userId,
        [Op.or]: [{ status: "unread" }, { status: " " }], // Correctly checking both conditions
      },
      attributes: [
        "id",
        "ticket_id",
        "sender_id",
        "recipient_id",
        "message",
        "channel",
        "status",
        "comment",
        "category",
        "created_at",
        "updated_at",
      ],
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: ["id", "status"],
          required: false,
        },
      ],
    });

    const validNotifications = notifications.filter((n) =>
      shouldIncludeUnreadNotification(n, userId)
    );
    
    const count = validNotifications.length;
    
    console.log(`Unread notification count for user ${userId}: ${count} (all unread notifications, excluding reversed)`);
    return res.status(200).json({ unreadCount: count });
  } catch (error) {
    console.error("Error fetching unread notification count:", error);
    return res
      .status(500)
      .json({ message: "Error fetching unread count", error: error.message });
  }
};

// Get unread tickets count for sidebar (count distinct tickets with unread notifications that have messages - same logic as table, exclude reversed)
const getUnreadTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get all unread notifications with comments (same logic as table) but exclude reversed tickets
    const notifications = await Notification.findAll({
      where: {
        recipient_id: userId,
        [Op.or]: [{ status: "unread" }, { status: " " }], // Correctly checking both conditions
      },
      attributes: ["ticket_id", "comment", "message", "category"],
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: ["id", "status"],
          required: false,
        },
      ],
    });

    const validNotifications = notifications.filter((n) => {
      const hasComment =
        n.comment && typeof n.comment === "string" && n.comment.trim() !== "";
      const hasMessage =
        n.message && typeof n.message === "string" && n.message.trim() !== "";
      const hasMessageContent = hasComment || hasMessage;

      if (!hasMessageContent) return false;

      if (isHandoverNotification(n)) {
        return Boolean(n.ticket_id);
      }

      if (!n.ticket_id) return false;

      return shouldIncludeUnreadNotification(n, userId);
    });
    
    // Get unique ticket IDs
    const uniqueTicketIds = [...new Set(validNotifications.map(n => n.ticket_id).filter(id => id !== null))];
    const count = uniqueTicketIds.length;
    
    console.log(`Unread tickets count for user ${userId}: ${count} (distinct tickets with unread notifications that have messages, excluding reversed)`);
    return res.status(200).json({ unreadTicketsCount: count });
  } catch (error) {
    console.error("Error fetching unread tickets count:", error);
    return res
      .status(500)
      .json({ message: "Error fetching unread tickets count", error: error.message });
  }
};

// Get notifications by ticket ID
const getNotificationsByTicketId = async (req, res) => {
  try {
    const { ticketId } = req.params;
    console.log("Fetching notifications for ticket:", ticketId);

    const notifications = await Notification.findAll({
      where: { ticket_id: ticketId },
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: [
            "id",
            "ticket_id",
            "subject",
            "category",
            "status",
            "description",
          ],
        },
        {
          model: require("../../models/User"),
          as: "sender",
          attributes: ["id", "full_name"],
        },
        {
          model: require("../../models/User"),
          as: "recipient",
          attributes: ["id", "full_name"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    console.log("Found notifications:", notifications.length);
    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("Error fetching ticket notifications:", error);
    return res.status(500).json({
      message: "Error fetching ticket notifications",
      error: error.message,
    });
  }
};

// Get count of unique tickets the user was notified about
const getNotifiedTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    // Find all notifications for this user, group by ticket_id
    const notifiedTickets = await Notification.findAll({
      where: { recipient_id: userId },
      attributes: [
        [Sequelize.fn("DISTINCT", Sequelize.col("ticket_id")), "ticket_id"],
      ],
    });
    res.status(200).json({
      notifiedTicketCount: notifiedTickets.length,
      ticketIds: notifiedTickets.map((n) => n.ticket_id),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all notifications for a ticket sent to a specific user
const getNotificationsByTicketAndRecipient = async (req, res) => {
  try {
    const { ticketId, userId } = req.params;
    const notifications = await Notification.findAll({
      where: {
        ticket_id: ticketId,
        recipient_id: userId,
      },
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: [
            "id",
            "ticket_id",
            "subject",
            "category",
            "status",
            "description",
          ],
        },
        {
          model: require("../../models/User"),
          as: "sender",
          attributes: ["id", "full_name"],
        },
        {
          model: require("../../models/User"),
          as: "recipient",
          attributes: ["id", "full_name"],
        },
      ],
      order: [["created_at", "DESC"]],
    });
    return res.status(200).json({ notifications });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching notifications", error: error.message });
  }
};

// Get all notifications for a user (for reports - includes read and unread)
const getAllNotificationsForReport = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    // Get ALL notifications (read and unread) - no status filter
    const allNotifications = await Notification.findAll({
      where: {
        recipient_id: userId,
      },
      attributes: ['id', 'ticket_id', 'sender_id', 'recipient_id', 'message', 'channel', 'status', 'comment', 'created_at', 'updated_at', 'category'],
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: [
            "id",
            "ticket_id",
            "subject",
            "category",
            "status",
            "description",
          ],
          required: false // Left join to include notifications even if ticket is deleted
        },
      ],
      order: [["created_at", "DESC"]],
    });
    
    // Filter by date range if provided
    let filteredNotifications = allNotifications;
    if (startDate || endDate) {
      filteredNotifications = allNotifications.filter(n => {
        if (!n.created_at) return false;
        const notificationDate = new Date(n.created_at).toISOString().split("T")[0];
        if (startDate && notificationDate < startDate) return false;
        if (endDate && notificationDate > endDate) return false;
        return true;
      });
    }
    
    // Filter out notifications for reversed tickets, BUT include:
    // 1. Reversal notifications for the recipient
    // 2. Tagged/mentioned notifications (always include, even if ticket is reversed)
    const notifications = filteredNotifications.filter(n => {
      if (!n.ticket) return true; // Include notifications without tickets for reports
      
      const messageText = (n.message || '').toLowerCase();
      
      // Always include tagged/mentioned notifications, regardless of ticket status
      const isTaggedNotification = messageText.includes('mentioned you');
      
      if (isTaggedNotification) {
        return true; // Always include tagged notifications
      }
      
      // If ticket is reversed, only include if it's a reversal notification for this user
      const ticketStatus = n.ticket.status || '';
      const isReversedTicket = ticketStatus.toLowerCase() === 'reversed';
      
      if (isReversedTicket) {
        const recipientId = n.recipient_id;
        const isForCurrentUser = String(recipientId) === String(userId);
        
        // Include if it's for current user and message indicates ticket was reversed back to this user
        return isForCurrentUser && (
          messageText.includes('reversed back to you') || 
          messageText.includes('reversed to you') ||
          messageText.includes('reassigned to focal person') ||
          (messageText.includes('has been reversed') && messageText.includes('to'))
        );
      }
      
      // For non-reversed tickets, include all
      return true;
    });
    
    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("Error fetching all notifications for report:", error);
    return res
      .status(500)
      .json({ message: "Error fetching notifications", error: error.message });
  }
};

module.exports = {
  createNotification,
  listNotifications,
  markAsRead,
  getUnreadCount,
  getUnreadTicketsCount,
  getNotificationById,
  getNotificationsByTicketId,
  getNotifiedTicketsCount,
  getNotificationsByTicketAndRecipient,
  getAllNotificationsForReport,
};
