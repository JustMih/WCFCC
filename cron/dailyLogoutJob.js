const cron = require("node-cron");
const {
  getDailyLogoutCronExpression,
  getDailyLogoutTimeLabel,
  runDailyAgentLogout,
} = require("../utils/dailyLogoutHelper");

const cronExpr = getDailyLogoutCronExpression();
const timeLabel = getDailyLogoutTimeLabel();

cron.schedule(
  cronExpr,
  async () => {
    try {
      await runDailyAgentLogout();
    } catch (err) {
      console.error("[DailyLogout] Job failed:", err);
    }
  },
  { timezone: "Africa/Dar_es_Salaam" }
);

console.log(
  `[DailyLogout] Cron scheduled: ${cronExpr} (Africa/Dar_es_Salaam, target ${timeLabel})`
);
