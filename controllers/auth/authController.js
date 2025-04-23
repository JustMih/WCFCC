const User = require("../../models/User");
const AgentLoginLog = require("../../models/agent_activity_logs");
const AgentStatus = require("../../models/agents_status");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Op } = require("sequelize");
require("dotenv").config();

const registerSuperAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({
      where: { role: "super-admin" },
    });
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

// const login = async (req, res) => {
//   const { email, password } = req.body;

//   // Find user by email
//   const user = await User.findOne({ where: { email } });
//   if (!user) {
//     return res.status(400).json({ message: "Invalid email or password" });
//   }

//   // Initialize failed login attempts if not set
//   if (!user.failedLoginAttempts || isNaN(user.failedLoginAttempts)) {
//     user.failedLoginAttempts = 0; // Initialize if undefined or NaN
//   }

//   console.log(
//     `User before incrementing: Failed login attempts = ${user.failedLoginAttempts}`
//   );

//   // Check if user is locked out
//   if (user.failedLoginAttempts >= 3) {
//     const lockoutTime = 5 * 60 * 1000; // 5 minutes in milliseconds
//     const lastFailedLoginTime = new Date(user.lastFailedLogin);

//     // Check if lastFailedLogin is a valid date
//     if (isNaN(lastFailedLoginTime.getTime())) {
//       return res
//         .status(400)
//         .json({ message: "Invalid last failed login time" });
//     }

//     const timePassed = new Date().getTime() - lastFailedLoginTime.getTime();
//     console.log(`Time passed since last failed login: ${timePassed} ms`);

//     if (timePassed < lockoutTime) {
//       const timeRemaining = lockoutTime - timePassed;
//       const minutesRemaining = Math.ceil(timeRemaining / 60000); // Time remaining in minutes
//       console.log(
//         `Account is locked. Try again in ${minutesRemaining} minute(s).`
//       );
//       return res.status(400).json({
//         message: `Your account is locked. Try again in ${minutesRemaining} minute${
//           minutesRemaining > 1 ? "s" : ""
//         }.`,
//         timeRemaining,
//       });
//     } else {
//       // Reset failed attempts after lockout time has passed
//       user.failedLoginAttempts = 0;
//       user.lastFailedLogin = null;

//       try {
//         await user.save();
//         console.log("Lockout period passed. Resetting failed attempts.");
//       } catch (err) {
//         console.error("Error resetting user lockout:", err);
//         return res.status(500).json({ message: "Internal server error" });
//       }
//     }
//   }

//   // Check password
//   const isMatch = await bcrypt.compare(password, user.password);
//   if (!isMatch) {
//     // Increment failed login attempts
//     user.failedLoginAttempts = user.failedLoginAttempts + 1;
//     user.lastFailedLogin = new Date();

//     // Log the user data before saving for debugging
//     console.log(
//       "User data before save:",
//       user.failedLoginAttempts,
//       user.lastFailedLogin
//     );

//     try {
//       // Ensure user is saved to the database
//       await user.save();

//       // Log the updated data after saving
//       console.log("User data after save:", user.failedLoginAttempts);
//     } catch (err) {
//       console.error("Error saving user:", err);
//       return res.status(500).json({ message: "Internal server error" });
//     }

//     return res.status(400).json({ message: "Invalid email or password" });
//   }

//   // Ensure account is active
//   if (!user.isActive) {
//     return res.status(400).json({ message: "Account is inactive" });
//   }

//   // Set user status to "online"
//   user.status = "online";
//   await user.save();

//   // Generate JWT token
//   const token = jwt.sign(
//     { userId: user.id, role: user.role },
//     process.env.JWT_SECRET,
//     { expiresIn: "1h" }
//   );

//   // Log agent login in AgentLoginLog
//   if (user.role === "agent") {
//     await AgentLoginLog.create({
//       userId: user.id,
//       role: "agent",
//       loginTime: new Date(),
//       logoutTime: null, // Will be updated on logout
//       totalOnlineTime: 0, // Will be calculated later
//     });
//     console.log(`Agent ${user.name} logged in.`);
//   }

//   res.json({
//     message: "Login successful",
//     token,
//     user: {
//       name: user.name,
//       isActive: user.isActive,
//       role: user.role,
//       id: user.id,
//     },
//   });
// };


const login = async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  // Check password
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  // Ensure account is active
  if (!user.isActive) {
    return res.status(400).json({ message: "Account is inactive" });
  }

  // Set user status to "online"
  user.status = "online";
  await user.save();

  // Generate JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  // Log agent login in AgentLoginLog
  if (user.role === "agent") {
    await AgentLoginLog.create({
      userId: user.id,
      role: "agent",
      loginTime: new Date(),
      logoutTime: null, // Will be updated on logout
      totalOnlineTime: 0, // Will be calculated later
    });
    console.log(`Agent ${user.name} logged in.`);
  }

  res.json({
    message: "Login successful",
    token,
    user: {
      name: user.name,
      isActive: user.isActive,
      role: user.role,
      id: user.id,
    },
  });
};
const logout = async (req, res) => {
  const { userId } = req.body;

  // Find the user
  const user = await User.findByPk(userId);
  if (!user) {
    return res.status(400).json({ message: "User not found" });
  }

  // Update user status to "offline"
  user.status = "offline";
  await user.save();

  // Find the latest login entry where logoutTime is NULL
  if (user.role === "agent") {
    const agentLog = await AgentLoginLog.findOne({
      where: { userId, logoutTime: null },
      order: [["loginTime", "DESC"]],
    });

    if (!agentLog) {
      return res
        .status(400)
        .json({ message: "No active login session found." });
    }

    // Calculate online duration
    const logoutTime = new Date();
    const onlineDuration = Math.floor((logoutTime - agentLog.loginTime) / 1000); // Convert to seconds

    // Update logout time and totalOnlineTime
    await agentLog.update({
      logoutTime: logoutTime,
      totalOnlineTime: onlineDuration,
    });

    console.log(
      `Agent ${userId} logged out at ${logoutTime}. Total time online: ${onlineDuration} seconds.`
    );
  }

  res.json({ message: "Logged out successfully" });
};

// Get time of agent login
const getAgentLoginTime = async (req, res) => {
  const { userId } = req.body;

  try {
    // Find the latest status entry for the agent with status "online"
    const agentStatus = await AgentStatus.findOne({
      where: {
        userId,
        status: "online",
      },
      order: [["createdAt", "DESC"]], // Get the most recent login status
    });

    // If no online status found for the agent
    if (!agentStatus) {
      return res.status(400).json({ message: "Agent is not online." });
    }

    // Return the login time of the agent
    res.json({
      message: "Agent login time retrieved successfully",
      loginTime: agentStatus.loginTime, // login time of the agent
    });
  } catch (error) {
    console.error("Error retrieving agent login time:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
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
  getAgentLoginTime,
};
