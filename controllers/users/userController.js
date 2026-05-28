const User = require("../../models/User");
const AgentLoginLog = require("../../models/agent_activity_logs");
const ChatMassage = require("../../models/chart_message");
const Pjsip_Endpoints = require("../../models/pjsip_endpoints");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator"); // For input validation
const { Sequelize } = require("sequelize");
const {
  sendEmailNonBlocking,
  renderEmailCard,
} = require("../../services/emailService");
const sequelize = require("../../config/mysql_connection");
const UserHandover = require("../../models/UserHandover");
const {
  startHandover,
  closeHandover,
  listActiveHandoversByActor,
} = require("../../services/handoverService");

const createUser = async (req, res) => {
  try {
    console.log("🚀 CREATE USER ENDPOINT CALLED!");
    console.log("📥 Request body:", JSON.stringify(req.body, null, 2));

    const {
      full_name,
      report_to,
      designation,
      email,
      password,
      extension,
      role,
      isActive,
      unit_section,
      sub_section,
    } = req.body;

    console.log("🔍 Extracted data:");
    console.log("- full_name:", full_name);
    console.log("- email:", email);
    console.log("- role:", role);
    console.log("- extension (original):", extension);
    console.log(
      "- extension (converted):",
      extension ? parseInt(extension) : null
    );
    console.log("- isActive:", isActive);

    // Validate required fields
    if (!full_name || !email || !password || !role) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        message: "Missing required fields",
        required: ["full_name", "email", "password", "role"],
        received: { full_name, email, password: password ? "***" : null, role },
      });
    }

    // Validate that focal-person must have unit_section (sub-section) ONLY if it's for a directorate
    // For units, sub-section is not required
    if (role === "focal-person") {
      const unitSectionLower = (unit_section || "").toLowerCase();
      const isDirectorate = unitSectionLower.includes("directorate");

      // Only require sub-section if it's a directorate
      if (isDirectorate && (!unit_section || unit_section.trim() === "")) {
        console.log(
          "❌ Focal person for directorate missing unit_section (sub-section)"
        );
        return res.status(400).json({
          message:
            "Focal person for directorate must have a sub-section (unit_section)",
          error: "Missing required field for focal-person role in directorate",
          field: "unit_section",
          role: role,
        });
      }
    }

    if (
      ![
        "admin",
        "supervisor",
        "agent",
        "attendee",
        "reviewer",
        "head-of-unit",
        "manager",
        "director",
        "focal-person",
        "director-general",
      ].includes(role)
    ) {
      console.log("❌ Invalid role:", role);
      return res
        .status(400)
        .json({ message: "Invalid role", receivedRole: role });
    }

    // Generate username from full_name
    const username = full_name.toLowerCase().replace(/\s+/g, ".");
    console.log("👤 Generated username:", username);

    console.log("🔐 Hashing password...");
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("✅ Password hashed successfully");

    console.log("💾 Creating user in database...");
    const userData = {
      full_name,
      report_to,
      designation,
      email,
      password: hashedPassword,
      extension: extension ? parseInt(extension) : null, // Convert to integer
      role,
      isActive,
      username,
      unit_section,
      sub_section,
    };
    console.log("📊 User data to create:", JSON.stringify(userData, null, 2));

    // Check if user with same email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.log("❌ User with email already exists:", email);
      return res.status(400).json({
        message: `Email ${email} is already registered. Please use a different email address.`,
        error: "Email already exists",
        field: "email",
        value: email,
        existingUser: existingUser.full_name,
      });
    }

    // Check if user with same extension already exists (if extension provided)
    if (userData.extension) {
      console.log("🔍 Checking for existing extension:", userData.extension);

      // Check in Users table
      const existingExtension = await User.findOne({
        where: { extension: userData.extension },
      });
      if (existingExtension) {
        console.log(
          "❌ User with extension already exists:",
          userData.extension
        );
        return res.status(400).json({
          message: `Extension ${userData.extension} is already assigned to another user. Please choose a different extension.`,
          error: "Extension already exists",
          field: "extension",
          value: userData.extension,
          existingUser: existingExtension.full_name,
        });
      }

      // Check in pjsip_endpoints table
      try {
        const pjsipEndpoint = await sequelize.query(
          "SELECT id FROM pjsip_endpoints WHERE id = :extension",
          {
            replacements: { extension: userData.extension },
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        if (pjsipEndpoint && pjsipEndpoint.length > 0) {
          console.log(
            "❌ Extension already exists in pjsip_endpoints:",
            userData.extension
          );
          return res.status(400).json({
            message: `Extension ${userData.extension} is already configured in the system. Please choose a different extension.`,
            error: "Extension already exists in pjsip_endpoints",
            field: "extension",
            value: userData.extension,
          });
        }
      } catch (pjsipError) {
        console.log(
          "ℹ️ Could not check pjsip_endpoints table:",
          pjsipError.message
        );
      }

      // Check in pjsip_aors table
      try {
        const pjsipAors = await sequelize.query(
          "SELECT id FROM pjsip_aors WHERE id = :extension",
          {
            replacements: { extension: userData.extension },
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        if (pjsipAors && pjsipAors.length > 0) {
          console.log(
            "❌ Extension already exists in pjsip_aors:",
            userData.extension
          );
          return res.status(400).json({
            message: `Extension ${userData.extension} is already configured in the system. Please choose a different extension.`,
            error: "Extension already exists in pjsip_aors",
            field: "extension",
            value: userData.extension,
          });
        }
      } catch (pjsipAorsError) {
        console.log(
          "ℹ️ Could not check pjsip_aors table:",
          pjsipAorsError.message
        );
      }

      // Check in pjsip_auths table
      try {
        const pjsipAuths = await sequelize.query(
          "SELECT id FROM pjsip_auths WHERE id = :extension",
          {
            replacements: { extension: userData.extension },
            type: Sequelize.QueryTypes.SELECT,
          }
        );

        if (pjsipAuths && pjsipAuths.length > 0) {
          console.log(
            "❌ Extension already exists in pjsip_auths:",
            userData.extension
          );
          return res.status(400).json({
            message: `Extension ${userData.extension} is already configured in the system. Please choose a different extension.`,
            error: "Extension already exists in pjsip_auths",
            field: "extension",
            value: userData.extension,
          });
        }
      } catch (pjsipAuthsError) {
        console.log(
          "ℹ️ Could not check pjsip_auths table:",
          pjsipAuthsError.message
        );
      }

      console.log("✅ Extension is available:", userData.extension);
    }

    console.log("✅ No conflicts found, creating user...");
    const newUser = await User.create(userData);
    console.log("✅ User created successfully with ID:", newUser.id);

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        report_to: newUser.report_to,
        designation: newUser.designation,
        email: newUser.email,
        extension: newUser.extension,
        role: newUser.role,
        isActive: newUser.isActive,
        username: newUser.username,
        unit_section: newUser.unit_section,
        sub_section: newUser.sub_section,
      },
    });
    console.log("📤 Response sent successfully");
  } catch (error) {
    console.error("❌ ERROR IN CREATE USER:");
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Error sql:", error.sql);
    console.error("Error sqlMessage:", error.sqlMessage);
    console.error("Error name:", error.name);
    console.error("Error errors:", error.errors);
    console.error("Full error stack:", error.stack);

    // Check for specific validation errors
    if (error.name === "SequelizeValidationError") {
      console.error("🔍 Validation errors found:");
      error.errors.forEach((err, index) => {
        console.error(
          `  ${index + 1}. Field: ${err.path}, Message: ${
            err.message
          }, Value: ${err.value}`
        );
      });

      // Create user-friendly validation messages
      const validationMessages = error.errors.map((err) => {
        let userMessage = err.message;

        // Customize messages for better UX
        if (err.path === "email" && err.message.includes("isEmail")) {
          userMessage = "Please enter a valid email address.";
        } else if (err.path === "role" && err.message.includes("ENUM")) {
          userMessage = "Please select a valid role from the dropdown.";
        } else if (
          err.path === "extension" &&
          err.message.includes("INTEGER")
        ) {
          userMessage = "Extension must be a number.";
        }

        return {
          field: err.path,
          message: userMessage,
          value: err.value,
        };
      });

      return res.status(400).json({
        message: "Please fix the following errors:",
        error: "Validation error",
        validationErrors: validationMessages,
      });
    }

    // Check for unique constraint violations
    if (error.name === "SequelizeUniqueConstraintError") {
      console.error("🔍 Unique constraint violation:");
      error.errors.forEach((err, index) => {
        console.error(
          `  ${index + 1}. Field: ${err.path}, Message: ${
            err.message
          }, Value: ${err.value}`
        );
      });

      // Create user-friendly constraint messages
      const constraintMessages = error.errors.map((err) => {
        let userMessage = err.message;

        // Customize messages for better UX
        if (err.path === "email") {
          userMessage = `Email ${err.value} is already registered. Please use a different email address.`;
        } else if (err.path === "extension") {
          userMessage = `Extension ${err.value} is already assigned to another user. Please choose a different extension.`;
        } else if (err.path === "username") {
          userMessage = `Username ${err.value} is already taken. Please choose a different username.`;
        }

        return {
          field: err.path,
          message: userMessage,
          value: err.value,
        };
      });

      return res.status(400).json({
        message: "Duplicate entry found",
        error: "Unique constraint violation",
        constraintErrors: constraintMessages,
      });
    }

    res.status(500).json({
      message: "Server error",
      error: error.message,
      details: {
        code: error.code,
        sql: error.sql,
        sqlMessage: error.sqlMessage,
      },
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent" },
    });

    const agentCount = agents.length;
    const total = agents.length;

    res.status(200).json({
      agents,
      count: agentCount,
      total: total,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCRMUsers = async (req, res) => {
  try {
    const { Op } = require("sequelize");
    const crmUsers = await User.findAll({
      where: {
        role: {
          [Op.in]: [
            "attendee",
            "agent",
            "reviewer",
            "head-of-unit",
            "manager",
            "director",
            "director-general",
            "focal-person",
            "claim-focal-person",
            "compliance-focal-person",
            "admin",
            "super-admin",
          ],
        },
        full_name: {
          [Op.ne]: null,
        },
      },
      attributes: ["id", "full_name", "email", "role"],
      order: [["full_name", "ASC"]],
    });

    res.status(200).json({
      users: crmUsers,
      count: crmUsers.length,
      total: crmUsers.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getSupervisor = async (req, res) => {
  try {
    const supervisors = await User.findAll({
      where: { role: "supervisor" },
    });

    const supervisorsCount = supervisors.length;

    res.status(200).json({
      supervisors,
      count: supervisorsCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// get admin
const getAdmin = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: { role: "admin" },
    });
    const adminsCount = admins.length;
    res.status(200).json({
      admins,
      count: adminsCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getUsersByRole = async (req, res) => {
  const { role } = req.params;
  try {
    const users = await User.findAll({
      where: { role },
    });
    const userCount = users.length;
    res.status(200).json({ users, count: userCount });
  } catch (error) {
    console.error("Error fetching users by role:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all conversations for a user (users they've chatted with)
const getConversations = async (req, res) => {
  const { userId } = req.params;

  try {
    // Get all messages where user is sender or receiver
    const allMessages = await ChatMassage.findAll({
      where: {
        [Op.or]: [{ senderId: userId }, { receiverId: userId }],
      },
      order: [["createdAt", "DESC"]],
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "message",
        "isRead",
        "createdAt",
      ],
    });

    // Group by other user ID
    const userMap = new Map();

    for (const msg of allMessages) {
      const otherUserId =
        msg.senderId === userId ? msg.receiverId : msg.senderId;

      if (!userMap.has(otherUserId)) {
        // Get unread count for this conversation
        const unreadCount = await ChatMassage.count({
          where: {
            senderId: otherUserId,
            receiverId: userId,
            isRead: false,
          },
        });

        userMap.set(otherUserId, {
          userId: otherUserId,
          lastMessageTime: msg.createdAt,
          lastMessage: {
            text: msg.message,
            senderId: msg.senderId,
            time: msg.createdAt,
            isRead: msg.isRead,
          },
          unreadCount: unreadCount,
        });
      }
    }

    // Convert map to array and sort
    const conversationList = Array.from(userMap.values());

    // Sort: unread first, then by time (most recent first)
    conversationList.sort((a, b) => {
      // First sort by unread count (unread first)
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      // Then sort by time (most recent first)
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });

    res.json({ conversations: conversationList });
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

const getMessage = async (req, res) => {
  const { user1, user2 } = req.params;

  try {
    const messages = await ChatMassage.findAll({
      where: {
        [Op.or]: [
          { senderId: user1, receiverId: user2 },
          { senderId: user2, receiverId: user1 },
        ],
      },
      order: [["createdAt", "ASC"]], // Sort messages by time
      attributes: [
        "id",
        "senderId",
        "receiverId",
        "message",
        "isRead",
        "status",
        "deliveredAt",
        "readAt",
        "createdAt",
        "updatedAt",
      ], // Include all necessary fields
    });

    // Format messages for frontend
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      message: msg.message,
      isRead: msg.isRead,
      status: msg.status || "sent",
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      timestamp: msg.createdAt,
      createdAt: msg.createdAt,
    }));

    // Check if there are no messages
    if (formattedMessages.length === 0) {
      return res.status(200).json([]); // Return empty array instead of 404
    }

    res.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

// Function to handle unread messages count
const unReadMessage = async (req, res) => {
  const { userId } = req.params;

  try {
    // Count unread messages for the user
    const unreadCount = await ChatMassage.count({
      where: {
        receiverId: userId,
        isRead: false, // Assuming you have an 'isRead' field to track read status
      },
    });

    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error("Error fetching unread messages count:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// function to get sender and receiver unread messages count
const getSenderReceiverUnreadCount = async (req, res) => {
  const { senderId, receiverId } = req.params;
  try {
    // Count unread messages for the sender
    const senderUnreadCount = await ChatMassage.count({
      where: {
        senderId: senderId,
        receiverId: receiverId,
        isRead: false, // Assuming you have an 'isRead' field to track read status
      },
    });
    // Count unread messages for the receiver
    const receiverUnreadCount = await ChatMassage.count({
      where: {
        senderId: receiverId,
        receiverId: senderId,
        isRead: false, // Assuming you have an 'isRead' field to track read status
      },
    });
    res.status(200).json({
      senderUnreadCount,
      receiverUnreadCount,
    });
  } catch (error) {
    console.error(
      "Error fetching sender and receiver unread messages count:",
      error
    );
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// update isRead to true when a receiver is read a message from sender
// Create/Send a new message
const createMessage = async (req, res) => {
  const { senderId, receiverId, message } = req.body;

  try {
    // Validate input
    if (!senderId || !receiverId || !message || !message.trim()) {
      return res.status(400).json({
        message: "senderId, receiverId, and message are required",
      });
    }

    // Fetch sender and receiver details for email
    const [sender, receiver] = await Promise.all([
      User.findByPk(senderId, { attributes: ["id", "full_name", "email"] }),
      User.findByPk(receiverId, { attributes: ["id", "full_name", "email"] }),
    ]);

    if (!sender || !receiver) {
      return res.status(404).json({
        message: "Sender or receiver not found",
      });
    }

    // Create message in database
    const newMessage = await ChatMassage.create({
      senderId,
      receiverId,
      message: message.trim(),
      isRead: false,
    });

    console.log(`✅ Message saved to database: ID ${newMessage.id}`);

    // Send email notification to receiver (non-blocking)
    if (receiver.email) {
      try {
        const senderName = sender.full_name || "User";
        const subject = `From CRM Chat: You have received a new CRM chat message from ${senderName}`;
        const bodyHtml = `
          <p>Hello ${receiver.full_name || "User"},</p>
          <p>You have received a new CRM chat message from <b>${senderName}</b>:</p>
        `;
        const detailsHtml = `
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p style="margin: 0; font-style: italic; color: #666;">"${message
              .trim()
              .substring(0, 300)}${
          message.trim().length > 300 ? "..." : ""
        }"</p>
          </div>
          <p>Please log into the CRM system to view and reply to this message.</p>
        `;
        const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);

        sendEmailNonBlocking({
          to: receiver.email,
          subject: subject,
          htmlBody: htmlBody,
        });

        console.log(
          `✅ [Chat Email] Email sending initiated to: ${receiver.email}`
        );
      } catch (emailError) {
        console.error(
          `❌ [Chat Email] Error sending email to ${receiver.email}:`,
          emailError
        );
        // Don't fail the request if email fails
      }
    } else {
      console.log(
        `⚠️ [Chat Email] Receiver ${receiver.full_name} has no email address`
      );
    }

    // Return the created message
    res.status(201).json({
      message: "Message sent successfully",
      data: {
        id: newMessage.id,
        senderId: newMessage.senderId,
        receiverId: newMessage.receiverId,
        message: newMessage.message,
        isRead: newMessage.isRead,
        timestamp: newMessage.createdAt,
        createdAt: newMessage.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Error creating message:", error);
    res.status(500).json({
      message: "Failed to send message",
      error: error.message,
    });
  }
};

const updateIsRead = async (req, res) => {
  const { senderId, receiverId } = req.params;

  try {
    // Log input values for debugging
    console.log(
      `Attempting to mark messages as read for senderId: ${senderId}, receiverId: ${receiverId}`
    );

    // Update the 'isRead' column for the messages from the sender to the receiver
    const [updatedRows] = await ChatMassage.update(
      { isRead: true },
      {
        where: {
          senderId: senderId,
          receiverId: receiverId,
          isRead: false, // Only update unread messages
        },
      }
    );

    // Check if any rows were updated
    if (updatedRows === 0) {
      console.log(
        `No unread messages found for senderId: ${senderId}, receiverId: ${receiverId}`
      );
      return res.status(404).json({ message: "No unread messages found" });
    }

    // Log success
    console.log(
      `${updatedRows} messages marked as read successfully for senderId: ${senderId}, receiverId: ${receiverId}`
    );

    res.status(200).json({ message: "Messages marked as read successfully" });
  } catch (error) {
    // Log the full error stack for debugging
    console.error("Error updating message read status:", error.stack);

    // Respond with a server error message
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOnlineUser = async (req, res) => {
  try {
    const onlineUser = await User.findAll({
      where: {
        role: {
          [Op.in]: ["agent", "supervisor"], // Check if role is either 'agent' or 'supervisor'
        },
        status: "online", // Check if status is 'online'
      },
    });

    res.status(200).json({ onlineUser });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgentOnline = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "online" },
    });

    const agentCount = agents.length;

    // Debugging: Check how many online agents were found
    console.log(`Found ${agentCount} online agents`);

    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching online agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateAgentStatus = async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;

  try {
    await User.update({ status }, { where: { id: userId } });
    res.json({ message: "Status updated" });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Server error" });
  }
};

const getAgentIdle = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "idle" },
    });
    const agentCount = agents.length;
    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgentActive = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "active" },
    });
    const agentCount = agents.length;
    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getInActiveUser = async (req, res) => {
  try {
    const inActiveUser = await User.findAll({
      where: { isActive: 0 },
    });

    res.status(200).json({ inActiveUser });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

const getAgentPause = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "pause" },
    });
    const agentCount = agents.length;
    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgentForcePause = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "force-pause" },
    });

    const agentCount = agents.length;

    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgentMission = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "mission" },
    });

    const agentCount = agents.length;

    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgentOffline = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "offline" },
    });

    const agentCount = agents.length;

    // Debugging: Check how many offline agents were found
    console.log(`Found ${agentCount} offline agents`);

    res.status(200).json({ agents, agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const GetAgentLogs = async (req, res) => {
  const { userId } = req.params;

  try {
    const logs = await AgentLoginLog.findAll({
      where: { userId: userId },
      order: [["loginTime", "DESC"]],
    });

    res.json({ logs });
  } catch (error) {
    console.error("Error fetching agent logs:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getSupervisorOnline = async (req, res) => {
  try {
    const supervisors = await User.findAll({
      where: { role: "supervisor", status: "online" },
    });

    const supervisorCount = supervisors.length;

    // Debugging: Check how many online agents were found
    console.log(`Found ${supervisorCount} online supervisors`);

    res.status(200).json({ supervisors, supervisorCount });
  } catch (error) {
    console.error("Error fetching online supervisors:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getSupervisorOffline = async (req, res) => {
  try {
    const supervisors = await User.findAll({
      where: { role: "supervisor", status: "offline" },
    });

    const supervisorCount = supervisors.length;

    // Debugging: Check how many online agents were found
    console.log(`Found ${supervisorCount} offline supervisors`);

    res.status(200).json({ supervisors, supervisorCount });
  } catch (error) {
    console.error("Error fetching offline supervisors:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    console.log("🗑️ DELETE USER ENDPOINT CALLED!");
    console.log("📥 User ID to delete:", userId);

    const user = await User.findByPk(userId);
    if (!user) {
      console.log("❌ User not found with ID:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("✅ User found:", user.full_name, "with email:", user.email);
    console.log("🗑️ Deleting user...");

    // Check if user has any related data that might prevent deletion
    try {
      // First, check if user has related pjsip_endpoints record using direct SQL
      console.log("🔍 Checking for pjsip_endpoints records...");
      const pjsipEndpoints = await sequelize.query(
        "SELECT id FROM pjsip_endpoints WHERE user_id = :userId",
        {
          replacements: { userId },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      console.log("📊 Found pjsip_endpoints records:", pjsipEndpoints);

      if (pjsipEndpoints && pjsipEndpoints.length > 0) {
        console.log(
          "🔗 Found related pjsip_endpoints record, deleting it first..."
        );

        // Get the extension number before deleting
        const extensionToClean = pjsipEndpoints[0].id;
        console.log("🔍 Extension to clean up:", extensionToClean);

        // STEP 1: Delete from pjsip_endpoints by user_id
        const deleteResult = await sequelize.query(
          "DELETE FROM pjsip_endpoints WHERE user_id = :userId",
          {
            replacements: { userId },
            type: Sequelize.QueryTypes.DELETE,
          }
        );
        console.log(
          "✅ pjsip_endpoints record deleted by user_id. Result:",
          deleteResult
        );

        // STEP 2: Delete from pjsip_endpoints by extension ID (primary key)
        const deleteByExtensionResult = await sequelize.query(
          "DELETE FROM pjsip_endpoints WHERE id = :extension",
          {
            replacements: { extension: extensionToClean },
            type: Sequelize.QueryTypes.DELETE,
          }
        );
        console.log(
          "✅ pjsip_endpoints records with extension ID deleted. Result:",
          deleteByExtensionResult
        );

        // STEP 3: Clean up pjsip_aors table (extension acts as primary key)
        try {
          console.log(
            "🗑️ Cleaning up pjsip_aors table for extension:",
            extensionToClean
          );
          const deleteAorsResult = await sequelize.query(
            "DELETE FROM pjsip_aors WHERE id = :extension",
            {
              replacements: { extension: extensionToClean },
              type: Sequelize.QueryTypes.DELETE,
            }
          );
          console.log(
            "✅ pjsip_aors records deleted. Result:",
            deleteAorsResult
          );
        } catch (aorsError) {
          console.log("❌ Error deleting from pjsip_aors:", aorsError.message);
        }

        // STEP 4: Clean up pjsip_auths table (extension acts as primary key)
        try {
          console.log(
            "🗑️ Cleaning up pjsip_auths table for extension:",
            extensionToClean
          );
          const deleteAuthsResult = await sequelize.query(
            "DELETE FROM pjsip_auths WHERE id = :extension",
            {
              replacements: { extension: extensionToClean },
              type: Sequelize.QueryTypes.DELETE,
            }
          );
          console.log(
            "✅ pjsip_auths records deleted. Result:",
            deleteAuthsResult
          );
        } catch (authsError) {
          console.log(
            "❌ Error deleting from pjsip_auths:",
            authsError.message
          );
        }

        // Double-check that the extension is completely removed from pjsip_endpoints
        console.log("🔍 Double-checking extension cleanup...");
        const remainingEndpoints = await sequelize.query(
          "SELECT id FROM pjsip_endpoints WHERE id = :extension",
          {
            replacements: { extension: extensionToClean },
            type: Sequelize.QueryTypes.SELECT,
          }
        );
        console.log(
          "📊 Remaining pjsip_endpoints with extension:",
          remainingEndpoints
        );

        if (remainingEndpoints && remainingEndpoints.length > 0) {
          console.log(
            "⚠️ Extension still exists in pjsip_endpoints, forcing deletion..."
          );
          const forceDeleteResult = await sequelize.query(
            "DELETE FROM pjsip_endpoints WHERE id = :extension",
            {
              replacements: { extension: extensionToClean },
              type: Sequelize.QueryTypes.DELETE,
            }
          );
          console.log("✅ Force deletion result:", forceDeleteResult);
        }
      } else {
        console.log("ℹ️ No pjsip_endpoints records found for this user");
      }

      // Check for other potential foreign key relationships
      console.log("🔍 Checking for other foreign key relationships...");

      // Check if there are any other tables that might reference this user
      const tablesToCheck = [
        "tickets",
        "agent_activity_logs",
        "chart_message",
        "agent_assignments",
      ];

      for (const tableName of tablesToCheck) {
        try {
          const result = await sequelize.query(
            `SELECT COUNT(*) as count FROM ${tableName} WHERE user_id = :userId OR userId = :userId OR assigned_to = :userId`,
            {
              replacements: { userId },
              type: Sequelize.QueryTypes.SELECT,
            }
          );
          console.log(`📊 ${tableName} records:`, result[0].count);
        } catch (tableError) {
          console.log(`ℹ️ Table ${tableName} not found or no relevant columns`);
        }
      }

      // Now delete the user using direct SQL to bypass any ORM issues
      console.log("🗑️ Deleting user using direct SQL...");
      const deleteUserResult = await sequelize.query(
        "DELETE FROM Users WHERE id = :userId",
        {
          replacements: { userId },
          type: Sequelize.QueryTypes.DELETE,
        }
      );
      console.log(
        "✅ User deleted successfully using direct SQL. Result:",
        deleteUserResult
      );

      // Final verification - check if any traces of the extension remain
      console.log(
        "🔍 Final verification - checking for remaining extension traces..."
      );

      // Check if extension still exists in Users table
      const remainingUserExtension = await sequelize.query(
        "SELECT id, full_name, extension FROM Users WHERE extension = :extension",
        {
          replacements: { extension: user.extension },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      console.log("📊 Remaining Users with extension:", remainingUserExtension);

      // Check if extension still exists in pjsip_endpoints table
      if (user.extension) {
        const remainingPjsipExtension = await sequelize.query(
          "SELECT id FROM pjsip_endpoints WHERE id = :extension",
          {
            replacements: { extension: user.extension },
            type: Sequelize.QueryTypes.SELECT,
          }
        );
        console.log(
          "📊 Remaining pjsip_endpoints with extension:",
          remainingPjsipExtension
        );
      }
    } catch (destroyError) {
      console.error("❌ Error during user.destroy():", destroyError);

      // Check if it's a foreign key constraint error
      if (destroyError.name === "SequelizeForeignKeyConstraintError") {
        return res.status(400).json({
          message:
            "Cannot delete user. This user has related data (tickets, assignments, etc.) that must be removed first.",
          error: "Foreign key constraint violation",
          details: destroyError.message,
        });
      }

      throw destroyError; // Re-throw other errors
    }

    console.log("✅ User deleted successfully");
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("❌ ERROR IN DELETE USER:");
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Error sql:", error.sql);
    console.error("Error sqlMessage:", error.sqlMessage);
    console.error("Full error stack:", error.stack);

    res.status(500).json({
      message: "Server error",
      error: error.message,
      details: {
        code: error.code,
        sql: error.sql,
        sqlMessage: error.sqlMessage,
      },
    });
  }
};

const activateUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = true;
    await user.save();
    res.status(200).json({ message: "User activated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deactivateUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = false;
    await user.save();
    res.status(200).json({ message: "User deactivated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// const updateUser = async (req, res) => {
//   const userId = req.params.id;
//   const { name, email, password, role, isActive, extension } = req.body;

//   try {
//     // Find the user by ID
//     const user = await User.findByPk(userId);
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Validate input fields (you can extend this logic as needed)
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     // Check if email is being updated and ensure it's unique
//     if (email && email !== user.email) {
//       const existingUser = await User.findOne({ where: { email } });
//       if (existingUser) {
//         return res.status(400).json({ message: "Email already in use" });
//       }
//       user.email = email;
//     }

//     // Update other fields if provided
//     if (name) user.name = name;
//     if (password) {
//       // Hash new password if provided
//       const hashedPassword = await bcrypt.hash(password, 10);
//       user.password = hashedPassword;
//     }
//     if (role) user.role = role; // Optional: Only allow certain roles for admins
//     if (extension) user.extension = extension;
//     if (isActive) user.isActive = isActive;

//     // Save updated user to the database
//     await user.save();

//     // Return the updated user data
//     res.status(200).json({
//       message: "User updated successfully",
//       user: {
//         id: user.id,
//         name: user.name,
//         email: user.email,
//         extension: user.extension,
//         role: user.role,
//         isActive: user.isActive,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

const updateUser = async (req, res) => {
  const userId = req.params.id;
  const {
    full_name,
    report_to,
    designation,
    email,
    password,
    role,
    isActive,
    extension,
    unit_section,
    sub_section,
  } = req.body;

  try {
    // Find the user by ID
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate input fields (you can extend this logic as needed)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Validate that focal-person must have unit_section (sub-section) ONLY if it's for a directorate
    // For units, sub-section is not required
    // Check if role is being updated to focal-person or if user is already focal-person
    const newRole = role || user.role;
    const newUnitSection =
      unit_section !== undefined ? unit_section : user.unit_section;

    if (newRole === "focal-person") {
      const unitSectionLower = (newUnitSection || "").toLowerCase();
      const isDirectorate = unitSectionLower.includes("directorate");

      // Only require sub-section if it's a directorate
      if (isDirectorate && (!newUnitSection || newUnitSection.trim() === "")) {
        console.log(
          "❌ Focal person for directorate missing unit_section (sub-section)"
        );
        return res.status(400).json({
          message:
            "Focal person for directorate must have a sub-section (unit_section)",
          error: "Missing required field for focal-person role in directorate",
          field: "unit_section",
          role: newRole,
        });
      }
    }

    // Check if email is being updated and ensure it's unique
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    // Update other fields if provided
    if (full_name) {
      user.full_name = full_name;
      // Generate username from full_name
      user.username = full_name.toLowerCase().replace(/\s+/g, ".");
    }
    if (report_to) user.report_to = report_to;
    if (designation) user.designation = designation;
    if (password) {
      // Hash new password if provided
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }
    if (role) user.role = role; // Optional: Only allow certain roles for admins
    if (extension) user.extension = extension;
    if (isActive !== undefined) user.isActive = isActive;
    if (unit_section !== undefined) user.unit_section = unit_section;
    if (sub_section !== undefined) user.sub_section = sub_section;

    // If role is 'agent', handle extension logic
    if (role === "agent" && extension) {
      // Check if extension exists in the pjsip_endpoints table
      const [existingEndpoint] = await sequelize.query(
        `SELECT * FROM pjsip_endpoints WHERE id = :extension`,
        {
          replacements: { extension },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      if (!existingEndpoint) {
        // Insert new record in pjsip_endpoints if extension does not exist
        await sequelize.query(
          `INSERT INTO pjsip_endpoints (
            id, transport, aors, auth, context, disallow, allow, direct_media, 
            from_domain, qualify_frequency, media_address, dtmf_mode, force_rport, 
            comedia, rtp_symmetric, createdAt, updatedAt, trust_id_inbound, 
            ignore_183_without_sdp, inband_progress, early_media, rewrite_contact, 
            insecure, \`match\`, trust_id_outbound, media_encryption, 
            dtls_auto_generate_cert, webrtc, ice_support, force_avp, rtcp_mux, 
            user_id, mailboxes
          ) VALUES (
            :extension, "transport-wss", :extension, :extension, "internal", "all", "ulaw", 
            "no", NULL, 60, "10.7.8.194", "auto", "yes", "yes", "yes", NOW(), NOW(), 
            NULL, NULL, NULL, NULL, "yes", Null, NULL, NULL, "yes", "dtls", "yes", "yes", "yes", "yes", 
            :userId, NULL
          )`,
          {
            replacements: { extension, userId },
            type: Sequelize.QueryTypes.INSERT,
          }
        );
      }
    }

    // Save updated user to the database
    await user.save();

    // Return the updated user data
    res.status(200).json({
      message: "User updated successfully",
      user: {
        id: user.id,
        full_name: user.full_name,
        report_to: user.report_to,
        designation: user.designation,
        email: user.email,
        extension: user.extension,
        role: user.role,
        isActive: user.isActive,
        unit_section: user.unit_section,
        sub_section: user.sub_section,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update the user status by ID
const updateUserStatus = async (req, res) => {
  const { userId } = req.params; // Get userId from the request params
  const { status } = req.body; // Get the new status from the request body

  try {
    // Check if the status value is valid (you can adjust this validation as per your requirements)
    const validStatuses = [
      "online",
      "offline",
      "idle",
      "pause",
      "active",
      "force-pause",
      "mission",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    // Update the status for the user with the given userId
    await User.update({ status }, { where: { id: userId } });

    res.status(200).json({ message: "User status updated successfully" });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Server error" });
  }
};

const resetUserPassword = async (req, res) => {
  const userId = req.params.id;
  const defaultPassword = "wcf12345"; // Default password to reset to

  try {
    // Check if the user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the default password
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    user.password = hashedPassword;

    // Save the updated password
    await user.save();

    res.status(200).json({
      message: "Password reset successfully",
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const startUserHandover = async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const actorRole = req.user?.role;
    const isAdmin = actorRole === "admin" || actorRole === "super-admin";

    const {
      from_user_id: requestedFromUserId,
      to_user_id: toUserId,
      return_at: returnAt,
      reason,
    } = req.body || {};

    const fromUserId = isAdmin ? requestedFromUserId || actorId : actorId;

    if (!actorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!fromUserId || !toUserId || !returnAt) {
      return res.status(400).json({
        message: "from_user_id, to_user_id and return_at are required",
      });
    }

    if (!isAdmin && requestedFromUserId && String(requestedFromUserId) !== String(actorId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const result = await startHandover({
      fromUserId,
      toUserId,
      returnAt,
      reason,
      actorId,
      actorRole,
    });

    return res.status(201).json({
      success: true,
      message: "Handover started successfully",
      handover: result.handover,
      movedTicketCount: result.movedTicketCount,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

const revokeUserHandover = async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const actorRole = req.user?.role;
    const handoverId = req.params.id;

    const handover = await UserHandover.findByPk(handoverId);
    if (!handover) {
      return res.status(404).json({ message: "Handover not found" });
    }

    if (String(handover.from_user_id) !== String(actorId)) {
      return res.status(403).json({
        message: "Only the handover initiator can revoke this handover",
      });
    }

    const result = await closeHandover({
      handoverId,
      actorId,
      actorRole,
      mode: "revoked",
    });

    return res.status(200).json({
      success: true,
      message: "Handover revoked successfully",
      handover: result.handover,
      returnedTicketCount: result.returnedTicketCount,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

const getActiveHandovers = async (req, res) => {
  try {
    const actorId = req.user?.id || req.user?.userId;
    const actorRole = req.user?.role;
    if (!actorId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const actor = await User.findByPk(actorId, {
      attributes: ["id", "role", "unit_section"],
    });
    const handovers = await listActiveHandoversByActor({
      actorId,
      actorRole: actor?.role || actorRole,
      actorUnitSection: actor?.unit_section || null,
    });
    return res.status(200).json({ success: true, handovers });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getAgents,
  getCRMUsers,
  deleteUser,
  activateUser,
  deactivateUser,
  updateUser,
  resetUserPassword,
  getAgentOnline,
  getAgentOffline,
  getAgentActive,
  getAgentForcePause,
  getAgentIdle,
  getAgentMission,
  getAgentPause,
  GetAgentLogs,
  getSupervisor,
  getSupervisorOnline,
  getSupervisorOffline,
  getMessage,
  getConversations,
  createMessage,
  updateAgentStatus,
  updateUserStatus,
  getUsersByRole,
  unReadMessage,
  getSenderReceiverUnreadCount,
  updateIsRead,
  getOnlineUser,
  getInActiveUser,
  startUserHandover,
  revokeUserHandover,
  getActiveHandovers,
};
