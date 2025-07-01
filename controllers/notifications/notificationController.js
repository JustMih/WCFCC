const Notification = require("../../models/Notification");
const User = require("../../models/User");
const { Op } = require("sequelize");
const Ticket = require("../../models/Ticket");
const { sendEmail } = require("../../services/emailService");

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
    if (!message) missingFields.push("message");

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
        return res.status(404).json({ message: "Recipient user not found for this ticket." });
      }
    } else {
      return res.status(400).json({ message: "recipient_id or ticket_id with assigned_to_id is required." });
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        message: "Missing required fields.",
        missingFields
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
      category: category
    });

    // Step 5: Send email to the recipient
    if (recipientUser.email) {
      const emailSubject = `New Notification: ${category}`;
      const emailHtmlBody = `
        <div style="font-family: Arial, sans-serif; background: #f9f9f9; padding: 24px; border-radius: 8px; max-width: 600px; margin: auto;">
          <div style="background: #1976d2; color: #fff; padding: 16px 24px; border-radius: 8px 8px 0 0; font-size: 1.3rem; font-weight: bold;">
            WCF Customer Care Notification
          </div>
          <div style="background: #fff; padding: 24px; border-radius: 0 0 8px 8px;">
            <p style="font-size: 1.1rem; color: #333;">Dear <strong>${
              recipientUser.name
            }</strong>,</p>
            <p style="font-size: 1.1rem; color: #333;">Dear <strong>${
              recipientUser.id
            }</strong>,</p>
            <p style="font-size: 1.05rem; color: #333;">${default_message}</p>
            <p style="font-size: 1.05rem; color: #333;">${message}</p>
            <hr style="margin: 24px 0; border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 1rem; color: #555;"><strong>Ticket Subject:</strong> ${
              ticket ? ticket.subject : ""
            }</p>
            <p style="font-size: 1rem; color: #555;"><strong>Category:</strong> ${
              ticket ? ticket.category : ""
            }</p>
            <p style="font-size: 0.95rem; color: #888; margin-top: 32px;">Please log in to the system for more details.</p>
            <p style="font-size: 0.95rem; color: #888;">WCF Customer Care System</p>
          </div>
        </div>
      `;
      try {
        // await sendEmail({ to: recipientUser.email, subject: emailSubject, htmlBody: emailHtmlBody });
        await sendEmail({
          to: "rehema.said3@ttcl.co.tz",
          subject: emailSubject,
          htmlBody: emailHtmlBody
        });
      } catch (emailError) {
        console.error("Error sending notification email:", emailError.message);
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
        [Op.or]: [{ status: "unread" }, { status: " " }]
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
            "description"
          ]
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
          as: "ticket",
          attributes: [
            "id",
            "ticket_id",
            "subject",
            "category",
            "status",
            "description"
          ]
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
            "description"
          ]
        },
        {
          model: require("../../models/User"),
          as: "sender",
          attributes: ["id", "name"]
        },
        {
          model: require("../../models/User"),
          as: "recipient",
          attributes: ["id", "name"]
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
