const User = require("../../models/User");
const AgentStatus = require("../../models/agents_status");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
require("dotenv").config();

const registerSuperAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ where: { role: "super-admin" } });
    if (existingAdmin) {
      console.log("Super Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash("superadmin123", 10);
    await User.create({
      name: "Super Admin",
      email: "superadmin@wcf.go.tz",
      password: hashedPassword,
      role: "super-admin",
      isActive: true,
    });
    console.log("Super Admin created successfully");
  } catch (error) {
    console.error("Error creating Super Admin:", error);
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  // Check if email exists
  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  // Check if password matches
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(400).json({ message: "Account is inactive" });
  }

  // Update user status to "online"
  user.status = "online";
  await user.save(); // Save the updated status

  // Create JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // If the user is an agent, update agent status
  if (user.role === "agent") {
    await AgentStatus.create({
      userId: user.id,
      status: "online",
      loginTime: new Date(),
    });
    console.log(`Agent ${user.name} is now online.`);
  }

  // Return user object with isActive and name along with token
  res.json({
    message: "Login successful",
    token,
    user: {
      name: user.name,
      isActive: user.isActive,
      role: user.role,
    },
  });
};



const logout = async (req, res) => {
  const { userId } = req.body; // Assuming the userId is sent in the request body

  // Find the user by ID
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  // Update user status to "offline"
  user.status = "offline";
  await user.save(); // Save the updated status


  // Find the agent's current status
  const agentStatus = await AgentStatus.findOne({
    where: { userId, status: "online" },
    order: [["createdAt", "DESC"]], // Get the most recent login status
  });

  if (!agentStatus) {
    return res.status(400).json({ message: "Agent is not logged in." });
  }

  // Calculate the online time in seconds
  const logoutTime = new Date();
  const onlineDuration = (logoutTime - agentStatus.loginTime) / 1000; // Time in seconds

  // Update agent status to offline
  agentStatus.status = "offline";
  agentStatus.logoutTime = logoutTime;
  agentStatus.totalOnlineTime += onlineDuration; // Add the duration to the total time
  await agentStatus.save();

  // Notify agent is offline
  console.log(
    `Agent ${agentStatus.userId} is now offline. Online time today: ${onlineDuration} seconds.`
  );

  res.json({ message: "Logged out successfully" });
};

const getAgentOnlineTime = async (req, res) => {
  const { userId } = req.body;

  // Get the total online time for the current day
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0); // Start of today

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999); // End of today

  const agentStatus = await AgentStatus.findAll({
    where: {
      userId,
      loginTime: {
        [Op.gte]: todayStart, // Greater than or equal to start of today
        [Op.lte]: todayEnd, // Less than or equal to end of today
      },
    },
  });

  // Calculate total online time for today
  const totalOnlineTimeToday = agentStatus.reduce((total, status) => {
    return total + (status.totalOnlineTime || 0);
  }, 0);

  res.json({
    message: "Agent online time for today",
    totalOnlineTime: totalOnlineTimeToday, // Total online time in seconds
  });
};

const getTotalAgentStatus = async (req, res) => {
  try {
    // Count agents with status "online"
    const onlineCount = await AgentStatus.count({
      where: { status: "online" },
    });

    // Count agents with status "offline"
    const offlineCount = await AgentStatus.count({
      where: { status: "offline" },
    });

    res.status(200).json({
      onlineCount,
      offlineCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



module.exports = {
  registerSuperAdmin,
  login,
  logout,
  getAgentOnlineTime,
  getTotalAgentStatus,
};