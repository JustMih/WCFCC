const cron = require("node-cron");
const { User, AgentStatus } = require("../models");

// Run every day at 8:00 PM (20:00) server local time
cron.schedule("0 20 * * *", async () => {
  console.log("Running daily logout job (8 PM)...");
  try {
    const [userCount] = await User.update(
      { status: "offline" },
      { where: {} }
    );
    console.log(`Daily logout: set ${userCount} user(s) to offline.`);

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
