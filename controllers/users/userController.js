const User = require("../../models/User");
const AgentLoginLog = require("../../models/agent_activity_logs");
const ChatMassage = require("../../models/chart_message");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator"); // For input validation

const createUser = async (req, res) => {
  try {
    const { name, email, password, extension, role, isActive } = req.body;

    if (
      ![
        "admin",
        "supervisor",
        "agent",
        "attendee",
        "coordinator",
        "head-of-unit",
        "manager",
        "director",
        "focal-person",
        "director-general",
      ].includes(role)
    ) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      extension,
      role,
      isActive,
    });

    res
      .status(201)
      .json({ message: "User created successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
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

    res.status(200).json({
      agents,
      count: agentCount,
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

// get users by role
// "attendee",
// "coordinator",
// "focal-person",
// "director-general",
// "directorate of operations",
// "directorate of assessment services",
// "directorate of finance, planning and investment",
// "legal unit",
// "ict unit",
// "actuarial statistics and risk management",
// "public relation unit",
// "procurement management unit",
// "human resource management and attachment unit"

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
      attributes: ["senderId", "receiverId", "message", "createdAt"], // Only select necessary fields
      include: [
        {
          model: User,
          attributes: {
            exclude: ["password", "createdAt", "updatedAt", "role"],
          },
        },
      ],
    });

    // Check if there are no messages
    if (messages.length === 0) {
      return res
        .status(404)
        .json({ message: "No messages found between these users." });
    }

    res.json(messages);
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
}

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
    console.error("Error fetching sender and receiver unread messages count:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// update isRead to true when a receiver is read a message from sender
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
const deleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.destroy(); // Delete the user from the database
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
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

const updateUser = async (req, res) => {
  const userId = req.params.id;
  const { name, email, password, role, isActive, extension } = req.body;

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

    // Check if email is being updated and ensure it's unique
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    // Update other fields if provided
    if (name) user.name = name;
    if (password) {
      // Hash new password if provided
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }
    if (role) user.role = role; // Optional: Only allow certain roles for admins
    if (extension) user.extension = extension;
    if (isActive) user.isActive = isActive;

    // Save updated user to the database
    await user.save();

    // Return the updated user data
    res.status(200).json({
      message: "User updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        extension: user.extension,
        role: user.role,
        isActive: user.isActive,
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
    const validStatuses = ["online", "offline", "idle", "pause", "active", "force-pause", "mission"];
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
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getAgents,
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
  getMessage,
  updateAgentStatus,
  updateUserStatus,
  getUsersByRole,
  unReadMessage,
  getSenderReceiverUnreadCount,
  updateIsRead,
};
