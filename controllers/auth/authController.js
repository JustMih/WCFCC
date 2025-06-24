const { Client } = require("ldapts");
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

const authenticateActiveDirectory = async (username, password) => {
  const url = "ldap://10.0.7.78";
  const baseDN = "dc=ttcl,dc=co,dc=tz";
  const bindDN = `TTCLHQ\\${username}`;
  const client = new Client({ url });

  try {
    // LDAP bind (authenticate user)
    await client.bind(bindDN, password);
    console.log(`LDAP bind successful for ${username}`);

    // LDAP search for user
    const { searchEntries } = await client.search(baseDN, {
      scope: "sub",
      filter: `(sAMAccountName=${username})`,
      attributes: ["employeeID", "mail"],
    });

    if (searchEntries.length === 0) {
      throw new Error("User not found in LDAP.");
    }

    const ldapUser = searchEntries[0];
    return ldapUser; // Successfully found user in Active Directory
  } catch (error) {
    console.error("LDAP error:", error);
    throw new Error("Failed to authenticate user in Active Directory.");
  } finally {
    await client.unbind();
  }
};

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    let user;

    // Step 1: Check if username is superadmin
    if (username === "superadmin@wcf.go.tz") {
      // Authenticate directly from the local database
      user = await User.findOne({
        where: { email: username },
      });

      if (!user) {
        return res.status(400).json({
          message: "Super Admin not found in the database.",
        });
      }

      // Check password for super admin (can be skipped if hashed)
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: "Invalid password" });
      }
    } else {
      // Step 2: Authenticate against Active Directory for other users
      const ldapUser = await authenticateActiveDirectory(username, password);

      // Step 3: Check if user exists in the local database
      user = await User.findOne({
        where: { email: `${username}@wcf.go.tz` },
      });

      if (!user) {
        // If user doesn't exist, create a new user with inactive status
        user = await User.create({
          name: username, // Set name as the username from input
          email: `${username}@wcf.go.tz`, // Set email as username@wcf.go.tz
          password: "wcf12345", // Password will be updated later by the super admin
          extension: null,
          role: "agent",
          isActive: false, // Set as inactive initially
        });
        console.log(`User ${username} created with inactive status.`);
      }

      // Step 4: Check if the account is active
      if (user.isActive === false) {
        return res.status(400).json({
          message:
            "Your account is inactive. Please wait for the super admin to activate it.",
        });
      }
    }

    // Set user status to "online"
    user.status = "online";
    await user.save();

    // Step 5: Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Step 6: Return successful response
    res.json({
      message: "Login successful",
      token,
      user: {
        name: user.name,
        isActive: user.isActive,
        role: user.role,
        id: user.id,
        extension: user.extension,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).json({ message: error.message });
  }
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
  // if (user.role === "agent") {
  //   const agentLog = await AgentLoginLog.findOne({
  //     where: { userId, logoutTime: null },
  //     order: [["loginTime", "DESC"]],
  //   });

  //   if (!agentLog) {
  //     return res
  //       .status(400)
  //       .json({ message: "No active login session found." });
  //   }

  //   // Calculate online duration
  //   const logoutTime = new Date();
  //   const onlineDuration = Math.floor((logoutTime - agentLog.loginTime) / 1000); // Convert to seconds

  //   // Update logout time and totalOnlineTime
  //   await agentLog.update({
  //     logoutTime: logoutTime,
  //     totalOnlineTime: onlineDuration,
  //   });

  //   console.log(
  //     `Agent ${userId} logged out at ${logoutTime}. Total time online: ${onlineDuration} seconds.`
  //   );
  // }

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
