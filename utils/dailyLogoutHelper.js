const moment = require("moment");
const { Op } = require("sequelize");
const User = require("../models/User");
const AgentPauseSession = require("../models/agent_pause_sessions");

const TZ_OFFSET = "+03:00";
const DEFAULT_LOGOUT_TIME = "02:00";

function parseDailyLogoutTime() {
  const raw = (process.env.DAILY_LOGOUT_TIME || DEFAULT_LOGOUT_TIME).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) {
    console.warn(
      `[DailyLogout] Invalid DAILY_LOGOUT_TIME "${raw}", using ${DEFAULT_LOGOUT_TIME}`
    );
    return { hour: 2, minute: 0 };
  }
  const hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const minute = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return { hour, minute };
}

/** Next daily logout instant (EAT +03:00). */
function getNextDailyLogoutDate() {
  const { hour, minute } = parseDailyLogoutTime();
  const now = moment().utcOffset(TZ_OFFSET);
  let target = now.clone().hour(hour).minute(minute).second(0).millisecond(0);
  if (!target.isAfter(now)) {
    target = target.add(1, "day");
  }
  return target.toDate();
}

/** Seconds until next logout (min 60 for JWT). */
function getSecondsUntilNextDailyLogout() {
  const now = moment().utcOffset(TZ_OFFSET);
  const target = moment(getNextDailyLogoutDate()).utcOffset(TZ_OFFSET);
  return Math.max(60, target.diff(now, "seconds"));
}

function getDailyLogoutCronExpression() {
  const { hour, minute } = parseDailyLogoutTime();
  return `${minute} ${hour} * * *`;
}

function getDailyLogoutTimeLabel() {
  const { hour, minute } = parseDailyLogoutTime();
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function closeActivePauseSession(userId, endedAt = new Date()) {
  const session = await AgentPauseSession.findOne({
    where: { userId, ended_at: null },
    order: [["started_at", "DESC"]],
  });
  if (!session) return null;

  const started = new Date(session.started_at).getTime();
  const ended = new Date(endedAt).getTime();
  const durationSeconds = Math.max(0, Math.floor((ended - started) / 1000));
  const exceededSeconds = Math.max(
    0,
    durationSeconds - (session.allowed_seconds || 0)
  );

  await session.update({
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    exceeded_seconds: exceededSeconds,
  });
  return session;
}

/**
 * Force-logout all agents still online or on pause (DB + pause sessions).
 */
async function runDailyAgentLogout() {
  const AgentStatus = require("../models/agents_status");
  const now = new Date();
  const timeLabel = getDailyLogoutTimeLabel();

  console.log(`[DailyLogout] Running scheduled agent logout (${timeLabel} EAT)...`);

  const activeAgents = await User.findAll({
    where: {
      role: "agent",
      status: { [Op.in]: ["online", "pause"] },
    },
    attributes: ["id", "status"],
  });

  for (const agent of activeAgents) {
    if (agent.status === "pause") {
      await closeActivePauseSession(agent.id, now);
    }
  }

  const [userCount] = await User.update(
    { status: "offline" },
    { where: { role: "agent", status: { [Op.in]: ["online", "pause"] } } }
  );

  const [agentStatusCount] = await AgentStatus.update(
    { status: "offline", logoutTime: now },
    { where: { status: "online" } }
  );

  console.log(
    `[DailyLogout] ${userCount} agent(s) set offline; ${agentStatusCount} AgentStatus row(s) updated.`
  );
  return { userCount, agentStatusCount, activeBefore: activeAgents.length };
}

module.exports = {
  DEFAULT_LOGOUT_TIME,
  parseDailyLogoutTime,
  getNextDailyLogoutDate,
  getSecondsUntilNextDailyLogout,
  getDailyLogoutCronExpression,
  getDailyLogoutTimeLabel,
  runDailyAgentLogout,
};
