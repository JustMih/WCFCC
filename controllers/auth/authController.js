const { Client } = require("ldapts");
const User = require("../../models/User");
const AgentLoginLog = require("../../models/agent_activity_logs");
const AgentStatus = require("../../models/agents_status");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Op } = require("sequelize");
// const { getEffectiveRoles } = require("../../utils/roleMapper");
require("dotenv").config();

/** true unless USE_LDAP=false in .env */
const useLdap = () => {
  const v = (process.env.USE_LDAP ?? "true").trim().toLowerCase();
  return v !== "false";
};

/**
 * Returns seconds until the next daily logout time (default 2:00 PM / 14:00 server local time).
 * Uses DAILY_LOGOUT_TIME env (e.g. "14:00" or "14:00:00"); TZ env controls timezone.
 */
function getSecondsUntilNextDailyLogout() {
  const timeStr = (process.env.DAILY_LOGOUT_TIME || "20:10").trim();  
  const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
  const hour = Math.min(23, Math.max(0, parts[0] ?? 14));
  const minute = Math.min(59, Math.max(0, parts[1] ?? 0));
  const second = Math.min(59, Math.max(0, parts[2] ?? 0));

  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, second, 0);

  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  const seconds = Math.max(1, Math.floor((target - now) / 1000));
  return seconds;
}

/**
 * Returns the Date (ms) of the next daily logout time for the login response (expiresAt).
 */
function getNextDailyLogoutDate() {
  const timeStr = (process.env.DAILY_LOGOUT_TIME || "20:10").trim();
  const parts = timeStr.split(":").map((p) => parseInt(p, 10) || 0);
  const hour = Math.min(23, Math.max(0, parts[0] ?? 14));
  const minute = Math.min(59, Math.max(0, parts[1] ?? 0));
  const second = Math.min(59, Math.max(0, parts[2] ?? 0));

  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, second, 0);

  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

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
      full_name: "Super Admin",
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
  // const url = "ldap://10.0.7.78";
  // const bindDN = `TTCLHQ\\${username}`;
  // const baseDN = "dc=ttcl,dc=co,dc=tz";
  const url = "ldap://192.168.1.15";
  const baseDN = "dc=wcf,dc=go,dc=tz";
  const bindDN = `WCF\\${username}`;
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

/** Look up or create app user by login username (email or AD-style name). No password check. */
const resolveOrCreateUser = async (username) => {
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
  const email = isEmail ? username : `${username}@wcf.go.tz`;
  const localPart = isEmail ? username.split("@")[0] : username;

  let user = await User.findOne({ where: { email } });

  if (!user) {
    user = await User.create({
      full_name: localPart,
      email,
      password: "wcf12345",
      extension: null,
      role: "agent",
      isActive: false,
    });
    console.log(`User ${localPart} created with inactive status.`);
  }

  if (user.isActive === false) {
    const err = new Error(
      "Your account is inactive. Please wait for the super admin to activate it."
    );
    err.code = "INACTIVE";
    throw err;
  }

  return user;
};

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    let user;
    const ldapEnabled = useLdap();

    if (!ldapEnabled) {
      console.log("LDAP disabled (USE_LDAP=false): username-only login");
    }

    // Step 1: Check if username is superadmin
    if (username === "superadmin@wcf.go.tz") {
      user = await User.findOne({
        where: { email: username },
      });

      if (!user) {
        return res.status(400).json({
          message: "Super Admin not found in the database.",
        });
      }

      if (ldapEnabled) {
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(400).json({ message: "Invalid password" });
        }
      }
    } else if (!ldapEnabled) {
      try {
        user = await resolveOrCreateUser(username);
      } catch (err) {
        if (err.code === "INACTIVE") {
          return res.status(400).json({ message: err.message });
        }
        throw err;
      }
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
      const emailUsername = username.split("@")[0];
      console.log(`🔍 Email login detected. Extracted username: ${emailUsername}`);

      try {
        await authenticateActiveDirectory(emailUsername, password);
        console.log(`✅ LDAP authentication successful for email: ${username}`);
        user = await resolveOrCreateUser(username);
      } catch (ldapError) {
        if (ldapError.code === "INACTIVE") {
          return res.status(400).json({ message: ldapError.message });
        }
        console.error("LDAP authentication failed for email login:", ldapError.message);
        return res.status(400).json({
          message:
            "LDAP authentication failed. Please check your Active Directory password.",
        });
      }
    } else {
      try {
        await authenticateActiveDirectory(username, password);
        user = await resolveOrCreateUser(username);
      } catch (ldapError) {
        if (ldapError.code === "INACTIVE") {
          return res.status(400).json({ message: ldapError.message });
        }
        return res.status(400).json({ message: "LDAP authentication failed." });
      }
    }

    // Set user status to "online"
    user.status = "online";
    await user.save();

    // Update or create AgentStatus entry for agents
    if (user.role === "agent") {
      await AgentStatus.upsert({
        userId: user.id,
        status: "online",
        loginTime: new Date(),
        logoutTime: null,
        totalOnlineTime: 0,
      });
    }

    // Step 5: Generate JWT token
    // Agents: expire at DAILY_LOGOUT_TIME (e.g. 2 PM) – forced logout at that time.
    // Other roles (supervisor, admin, etc.): expire after 24h – forced logout after 24h.
    const roleLower = (user.role && String(user.role).toLowerCase()) || "";
    const isAgent = roleLower === "agent";
    const TWENTY_FOUR_HOURS_SEC = 24 * 60 * 60;
    const expiresInSeconds = isAgent
      ? getSecondsUntilNextDailyLogout()
      : TWENTY_FOUR_HOURS_SEC;
    const expiresAt = isAgent
      ? getNextDailyLogoutDate()
      : new Date(Date.now() + TWENTY_FOUR_HOURS_SEC * 1000);

    if (isAgent) {
      console.log("[Agent login] DAILY_LOGOUT_TIME:", process.env.DAILY_LOGOUT_TIME);
      console.log("[Agent login] Token expires at (server local):", expiresAt.toLocaleString());
      console.log("[Agent login] expiresAt (ms):", expiresAt.getTime(), "| in", Math.round(expiresInSeconds / 60), "minutes");
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: expiresInSeconds }
    );

    // Log agent login in AgentLoginLog
    // if (user.role === "agent") {
    //   await AgentLoginLog.create({
    //     userId: user.id,
    //     role: "agent",
    //     loginTime: new Date(),
    //     logoutTime: null, // Will be updated on logout
    //     totalOnlineTime: 0, // Will be calculated later
    //   });
    //   console.log(`Agent ${user.full_name} logged in.`);
    // }

    // Get effective roles based on user's base role and unit section
    // const effectiveRoles = getEffectiveRoles(user.role, user.unit_section);

    res.json({
      message: "Login successful",
      token,
      expiresAt: expiresAt.getTime(), // ms; agents = next DAILY_LOGOUT_TIME, others = 24h
      user: {
        full_name: user.full_name,
        isActive: user.isActive,
        role: user.role, // Base role
        // effectiveRoles: effectiveRoles, // All effective roles including mapped ones
        id: user.id,
        report_to: user.report_to || null,
        designation: user.designation || null,
        extension: user.extension || null,
        unit_section: user.unit_section || null,
        email: user.email || null,
        username: user.username || null,
      },
      credentials: {
        username: username,
        password: password,
      },
    });

    // Debug log to verify credentials are being sent
    console.log("Login response includes credentials for user:", username);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
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

  // Update AgentStatus for agents
  if (user.role === "agent") {
    await AgentStatus.update(
      {
        status: "offline",
        logoutTime: new Date(),
      },
      {
        where: { userId: user.id, status: "online" },
      }
    );
  }

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
    // Count agents with status "online" from User table (where role is "agent")
    const onlineCount = await User.count({
      where: {
        status: "online",
        role: "agent",
      },
    });

    // Count agents with status "offline" or null from User table (where role is "agent")
    const offlineCount = await User.count({
      where: {
        role: "agent",
        [Op.or]: [{ status: "offline" }, { status: null }],
      },
    });

    res.status(200).json({
      onlineCount,
      offlineCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// function encryptWithOpenSSL(payload) {
//   const keyString = 'yN!VkiK9#-GoUwB@eUD8l~zoY@3ccVmx'; // 32-char plain-text key
//   const key = Buffer.from(keyString, 'utf8'); // UTF-8 encoding, not base64

//   if (key.length !== 32) {
//     throw new Error(`ENCRYPTION_KEY must be exactly 32 bytes. Got ${key.length} bytes.`);
//   }

//   const plainText = typeof payload === 'string' ? payload : JSON.stringify(payload);
//   const iv = crypto.randomBytes(16); // 16-byte IV for AES-256-CBC

//   const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
//   let encrypted = cipher.update(plainText, 'utf8', 'base64');
//   encrypted += cipher.final('base64');

//   const ivBase64 = iv.toString('base64');
//   const combined = `${encrypted}::${ivBase64}`;
//   const finalToken = Buffer.from(combined, 'utf8').toString('base64');

//   return finalToken;
// }

function encryptWithOpenSSL(payload) {
  const keyString =
    process.env.ENCRYPTION_KEY || "yN!VkiK9#-GoUwB@eUD8l~zoY@3ccVmx"; // Use env var or fallback
  const key = Buffer.from(keyString, "utf8");

  if (key.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be exactly 32 bytes. Got ${key.length} bytes.`
    );
  }

  // Ensure payload is a plain, JSON-safe object
  const safePayload = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (v === null || v === undefined) {
      safePayload[k] = "";
    } else if (typeof v === "object") {
      // Avoid circular/non-serializable values by stringifying primitives only
      safePayload[k] = String(v);
    } else {
      safePayload[k] = v;
    }
  }

  const plainText = JSON.stringify(safePayload);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "base64");
  encrypted += cipher.final("base64");

  const ivBase64 = iv.toString("base64");
  const combined = `${encrypted}::${ivBase64}`;
  return Buffer.from(combined, "utf8").toString("base64");
}

// Re-enable the loginRedirect endpoint
const loginRedirect = async (req, res) => {
  try {
    // 1. Authenticate via JWT
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    // 2. Prepare data payload for encryption (sanitize inputs)
    const idRaw = req.body?.notification_report_id;
    const employerRaw = req.body?.employer_id;

    // Debug logging to see what values are coming from frontend
    console.log("🔍 Backend received values:", {
      idRaw: idRaw,
      idRawType: typeof idRaw,
      employerRaw: employerRaw,
      employerRawType: typeof employerRaw,
      fullBody: req.body,
    });

    // Extract username for MAC/AD
    // Prefer email prefix (usually matches AD account). Fallback to user.username.
    const usernameSource =
      (user.email && user.email.includes("@") ? user.email.split("@")[0] : "") ||
      user.username ||
      "";
    let username = usernameSource;
    if (!username) {
      return res.status(400).json({ 
        message: "User username not found. Cannot proceed with MAC login." 
      });
    }

    // MAC redirect: omit middle name (3+ parts cause "page not found").
    // Keep separator style: if source uses dots -> "first.last", else -> "first last".
    const trimmed = String(username).trim();
    const parts = trimmed.split(/[\s.]+/).filter(Boolean);
    if (parts.length >= 3) {
      const sep = trimmed.includes(".") ? "." : " ";
      username = `${parts[0]}${sep}${parts[parts.length - 1]}`;
    } else {
      username = trimmed;
    }

    console.log("🔍 Using logged-in user credentials:", {
      userId: user.id,
      usernameSource,
      username,
      email: user.email,
    });

    const auth_data = {
      username: username,
      notification_report_id: idRaw || "",
      employer_id:
        employerRaw !== undefined && employerRaw !== null ? employerRaw : "",
    };

    // Debug logging to see what's being sent to encryption
    console.log("🔍 Backend auth_data:", auth_data);

    // 3. Encrypt token
    const encryptedToken = encryptWithOpenSSL(auth_data);

    // 4. Build MAC App URL
    const macAppUrl = process.env.MAC_APP_URL || "https://mac.wcf.go.tz/";
    const url = `${macAppUrl}login_redirect?token=${encodeURIComponent(
      encryptedToken
    )}`;

    // 5. Respond appropriately
    const acceptsJson =
      req.headers.accept?.includes("application/json") ||
      req.headers["content-type"]?.includes("application/json");

    if (acceptsJson) {
      return res.json({
        success: {
          message: "Continue on MAC!",
          url: url,
        },
      });
    }

    return res.redirect(url);
  } catch (error) {
    console.error("Login redirect error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  registerSuperAdmin,
  login,
  logout,
  getAgentOnlineTime,
  getTotalAgentStatus,
  getAgentLoginTime,
  loginRedirect,
  encryptWithOpenSSL,
};