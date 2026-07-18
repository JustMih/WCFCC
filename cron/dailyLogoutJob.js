const cron = require("node-cron");
const {
  getDailyLogoutCronExpression,
  getDailyLogoutTimeLabel,
  runDailyUserLogout,
} = require("../utils/dailyLogoutHelper");

const cronExpr = getDailyLogoutCronExpression();
const timeLabel = getDailyLogoutTimeLabel();

cron.schedule(
  cronExpr,
  async () => {
    try {
      await runDailyUserLogout();
    } catch (err) {
      console.error("[DailyLogout] Job failed:", err);
    }
  },
  { timezone: "Africa/Dar_es_Salaam" }
);

console.log(
  `[DailyLogout] All-user cron scheduled: ${cronExpr} (Africa/Dar_es_Salaam, target ${timeLabel})`
);
