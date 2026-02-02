const cron = require("node-cron");
const { User, AgentStatus } = require("../models");

// Run every day at 2:00 PM (14:00) server local time – must match DAILY_LOGOUT_TIME in .env
cron.schedule("0 14 * * *", async () => {
  console.log("Running daily logout job (2 PM) – agents only...");
  try {
    const [userCount] = await User.update(
      { status: "offline" },
      { where: { role: "agent" } }
    );
    console.log(`Daily logout: set ${userCount} agent user(s) to offline.`);

    const now = new Date();
    const [agentStatusCount] = await AgentStatus.update(
      { status: "offline", logoutTime: now },
      { where: { status: "online" } }
    );
    console.log(`Daily logout: set ${agentStatusCount} agent status(es) to offline.`);
    console.log("Daily logout job complete.");
  } catch (err) {
    console.error("Error in daily logout job:", err);
  }
});
