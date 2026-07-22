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
const {
  getNextDailyLogoutDate,
  getSecondsUntilNextDailyLogout,
  getDailyLogoutTimeLabel,
} = require("../../utils/dailyLogoutHelper");
const {
  syncAgentQueuePauseFromStatus,
} = require("../../services/queuePauseService");

const SUPER_ADMIN_EMAIL = "superadmin@wcf.go.tz";

function isLdapEnabled() {
  const v = process.env.USE_LDAP;
  if (v == null || String(v).trim() === "") return true;
  return !/^false$/i.test(String(v).trim());
}

function resolveSamAccountName(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (raw.includes("\\")) return raw.split("\\").pop();
  if (raw.includes("@")) return raw.split("@")[0];
  return raw;
}

function ldapAttr(ldapUser, key) {
  const value = ldapUser?.[key];
  if (Array.isArray(value)) return value[0] || "";
  return value != null ? String(value).trim() : "";
}

const authenticateActiveDirectory = async (samAccountName, password) => {
  const url = process.env.LDAP_URL || "ldap://192.168.1.15";
  const baseDN = process.env.LDAP_BASE_DN || "dc=wcf,dc=go,dc=tz";
  const domain = process.env.LDAP_DOMAIN || "WCF";
  const bindDN = `${domain}\\${samAccountName}`;
  const client = new Client({ url });

  try {
    await client.bind(bindDN, password);
    console.log(`LDAP bind successful for ${samAccountName} (${url})`);

    const { searchEntries } = await client.search(baseDN, {
      scope: "sub",
      filter: `(sAMAccountName=${samAccountName})`,
      attributes: ["employeeID", "mail", "displayName"],
    });

    if (searchEntries.length === 0) {
      throw new Error("User not found in LDAP.");
    }

    return searchEntries[0];
  } catch (error) {
    console.error("LDAP error:", error?.message || error);
    throw new Error("Failed to authenticate user in Active Directory.");
  } finally {
    await client.unbind();
  }
};

async function findOrCreateUserFromLdap(samAccountName, ldapUser) {
  const mail = ldapAttr(ldapUser, "mail");
  const displayName = ldapAttr(ldapUser, "displayName") || samAccountName;
  const fallbackEmail = `${samAccountName}@wcf.go.tz`;
  const emailCandidates = [mail, fallbackEmail].filter(Boolean);

  let user = await User.findOne({
    where: { username: samAccountName },
  });

  if (!user && emailCandidates.length > 0) {
    user = await User.findOne({
      where: { email: { [Op.in]: emailCandidates } },
    });
  }

  if (!user) {
    const email = mail || fallbackEmail;
    user = await User.create({
      full_name: displayName,
      email,
      username: samAccountName,
      password: "wcf12345",
      extension: null,
      role: "agent",
      isActive: false,
    });
    console.log(`User ${samAccountName} created with inactive status.`);
  }

  return user;
}

async function authenticateWithLdap(username, password) {
  const samAccountName = resolveSamAccountName(username);
  if (!samAccountName) {
    throw new Error("Invalid username.");
  }
  const ldapUser = await authenticateActiveDirectory(samAccountName, password);
  const user = await findOrCreateUserFromLdap(samAccountName, ldapUser);
  return { user, samAccountName, ldapUser };
}

async function authenticateWithDatabase(email, password) {
  const user = await User.findOne({
    where: { email },
  });

  if (!user) {
    return { error: "Authentication failed. User not found.", status: 400 };
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return {
      error: "Authentication failed. Invalid password.",
      status: 400,
      user,
    };
  }

  if (user.isActive === false) {
    return {
      error:
        "Your account is inactive. Please wait for the super admin to activate it.",
      status: 400,
      user,
    };
  }

  return { user };
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
      email: SUPER_ADMIN_EMAIL,
      password: hashedPassword,
      role: "super-admin",
      isActive: true,
    });
    console.log("Super Admin created successfully");
  } catch (error) {
    console.error("Error creating Super Admin:", error);
  }
};

const setAuditContextSafely = (req, updates) => {
  if (typeof req?.setAuditContext === "function") {
    req.setAuditContext(updates);
  }
};

const setAuthenticationAudit = (req, options = {}) => {
  const {
    action = "login",
    status = "success",
    message,
    user = null,
    username = null,
    metadata = {},
    entityType = "user",
    entityId = null,
  } = options;

  const normalizedUsername =
    typeof username === "string" && username.trim() ? username.trim() : null;
  const actorEmail =
    user?.email ||
    (normalizedUsername && normalizedUsername.includes("@")
      ? normalizedUsername
      : null);

  setAuditContextSafely(req, {
    category: "authentication",
    action,
    status,
    entityType,
    entityId: entityId || user?.id || normalizedUsername,
    userId: user?.id || null,
    role: user?.role || null,
    actorName: user?.full_name || normalizedUsername || null,
    actorEmail,
    message,
    metadata,
  });
};

const login = async (req, res) => {
  const { username, password } = req.body;

  try {
    let user;
    let authSource = "database";

    if (username === SUPER_ADMIN_EMAIL) {
      authSource = "super-admin";
      user = await User.findOne({
        where: { email: SUPER_ADMIN_EMAIL },
      });

      if (!user) {
        setAuthenticationAudit(req, {
          status: "failure",
          message: "Super Admin not found in the database.",
          username,
          metadata: { authSource },
        });
        return res.status(400).json({
          message: "Super Admin not found in the database.",
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        setAuthenticationAudit(req, {
          status: "failure",
          message: "Invalid password",
          user,
          username,
          metadata: { authSource },
        });
        return res.status(400).json({ message: "Invalid password" });
      }
    } else if (isLdapEnabled()) {
      authSource = "ldap";
      try {
        const ldapResult = await authenticateWithLdap(username, password);
        user = ldapResult.user;

        if (user.isActive === false) {
          setAuthenticationAudit(req, {
            status: "failure",
            message:
              "Your account is inactive. Please wait for the super admin to activate it.",
            user,
            username,
            metadata: { authSource },
          });
          return res.status(400).json({
            message:
              "Your account is inactive. Please wait for the super admin to activate it.",
          });
        }
      } catch (ldapError) {
        setAuthenticationAudit(req, {
          status: "failure",
          message: "LDAP authentication failed.",
          username,
          metadata: { authSource },
        });
        return res.status(400).json({ message: "LDAP authentication failed." });
      }
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
      authSource = "database";
      const dbResult = await authenticateWithDatabase(username, password);
      if (dbResult.error) {
        setAuthenticationAudit(req, {
          status: "failure",
          message: dbResult.error,
          user: dbResult.user,
          username,
          metadata: { authSource },
        });
        return res.status(dbResult.status || 400).json({ message: dbResult.error });
      }
      user = dbResult.user;
    } else {
      setAuthenticationAudit(req, {
        status: "failure",
        message: "LDAP authentication is disabled. Use your email to sign in.",
        username,
        metadata: { authSource: "database" },
      });
      return res.status(400).json({
        message: "LDAP authentication is disabled. Use your email to sign in.",
      });
    }

    // Set user status to "online"
    user.status = "online";
    await user.save();

    // Unpause Asterisk queue member so inbound calls can ring the softphone
    if (user.extension) {
      syncAgentQueuePauseFromStatus(user.extension, "online");
    }

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

    // Step 5: Generate JWT token (agents expire at next daily logout; others 24h)
    const isAgent = String(user.role || "").toLowerCase() === "agent";
    let expiresAt;
    let jwtExpiresIn;
    if (isAgent) {
      const secondsUntilLogout = getSecondsUntilNextDailyLogout();
      expiresAt = getNextDailyLogoutDate().getTime();
      jwtExpiresIn = secondsUntilLogout;
      console.log(
        `[Agent login] Daily logout at ${getDailyLogoutTimeLabel()} EAT | expiresAt: ${new Date(expiresAt).toISOString()}`
      );
    } else {
      expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      jwtExpiresIn = "24h";
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiresIn }
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

    setAuthenticationAudit(req, {
      action: "login",
      status: "success",
      message: "Login successful",
      user,
      username,
      metadata: {
        authSource,
        isActive: user.isActive,
      },
    });

    res.json({
      message: "Login successful",
      token,
      expiresAt,
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
    setAuthenticationAudit(req, {
      status: "failure",
      message: error.message || "Server error",
      username,
      metadata: {
        authSource: "unknown",
      },
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const logout = async (req, res) => {
  const { userId } = req.body;

  try {
    // Find the user
    const user = await User.findByPk(userId);
    if (!user) {
      setAuthenticationAudit(req, {
        action: "logout",
        status: "failure",
        message: "User not found",
        entityId: userId || null,
        metadata: { requestedUserId: userId || null },
      });
      return res.status(400).json({ message: "User not found" });
    }

    // Update user status to "offline"
    user.status = "offline";
    await user.save();

    // Pause Asterisk queue member so logged-out agents do not receive queue rings
    if (user.extension) {
      syncAgentQueuePauseFromStatus(user.extension, "offline");
    }

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

    setAuthenticationAudit(req, {
      action: "logout",
      status: "success",
      message: "Logged out successfully",
      user,
      metadata: { requestedUserId: userId || null },
    });

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    setAuthenticationAudit(req, {
      action: "logout",
      status: "failure",
      message: error.message || "Server error",
      entityId: userId || null,
      metadata: { requestedUserId: userId || null },
    });
    res.status(500).json({ message: "Server error", error: error.message });
  }
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
      setAuthenticationAudit(req, {
        action: "login_redirect",
        status: "failure",
        message: "Authentication required",
        entityType: "external-login",
      });
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      setAuthenticationAudit(req, {
        action: "login_redirect",
        status: "failure",
        message: "User not found",
        entityType: "external-login",
        entityId: decoded.userId,
      });
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

    const auth_data = {
      username: "mmsaki-admin",
      notification_report_id: idRaw || "",
      employer_id:
        employerRaw !== undefined && employerRaw !== null ? employerRaw : "",
    };

    // Debug logging to see what's being sent to encryption
    console.log("🔍 Backend auth_data:", auth_data);

    // 3. Encrypt token
    const encryptedToken = encryptWithOpenSSL(auth_data);

    // 4. Build MAC App URL
    const macAppUrl = process.env.MAC_APP_URL || "https://contactcenter.wcf.go.tz/";
    const url = `${macAppUrl}login_redirect?token=${encodeURIComponent(
      encryptedToken
    )}`;

    // 5. Respond appropriately
    const acceptsJson =
      req.headers.accept?.includes("application/json") ||
      req.headers["content-type"]?.includes("application/json");

    setAuthenticationAudit(req, {
      action: "login_redirect",
      status: "success",
      message: "Continue on MAC!",
      user,
      entityType: "external-login",
      entityId: idRaw || employerRaw || user.id,
      metadata: {
        notification_report_id: idRaw || null,
        employer_id: employerRaw || null,
      },
    });

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
    setAuthenticationAudit(req, {
      action: "login_redirect",
      status: "failure",
      message: error.message || "Internal server error",
      entityType: "external-login",
    });
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


