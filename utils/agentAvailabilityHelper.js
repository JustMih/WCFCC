/**
 * Agent roster metrics for pause gating and live dashboard.
 * Active roster = agents with status online or pause.
 */

const MIN_ONLINE_RATIO = 0.5;

/**
 * Whether an online agent may switch to pause without dropping below 50% online.
 * Simulates: requester leaves online → pause (onlineCount - 1).
 * On public holidays, any logged-in online agent may pause (50% rule waived).
 */
function canAllowPause(onlineCount, pauseCount, isHoliday = false) {
  const online = Number(onlineCount) || 0;
  const pause = Number(pauseCount) || 0;
  if (online < 1) return false;
  if (isHoliday) return true;
  const totalActive = online + pause;
  if (totalActive < 1) return false;
  const onlineAfter = online - 1;
  return onlineAfter * 2 >= totalActive;
}

function getAgentAvailabilityMetrics(onlineCount, pauseCount, isHoliday = false) {
  const online = Number(onlineCount) || 0;
  const pause = Number(pauseCount) || 0;
  const totalActive = online + pause;

  let onlinePercent = 0;
  let pausePercent = 0;
  if (totalActive > 0) {
    onlinePercent = Math.round((online / totalActive) * 100);
    pausePercent = Math.round((pause / totalActive) * 100);
  }

  return {
    onlineCount: online,
    pauseCount: pause,
    totalActive,
    onlinePercent,
    pausePercent,
    isHoliday: Boolean(isHoliday),
    canPause: canAllowPause(online, pause, isHoliday),
  };
}

const PAUSE_BLOCKED_MESSAGE =
  "Cannot pause: at least 50% of logged-in agents must stay available. Wait for another agent to return online.";

module.exports = {
  MIN_ONLINE_RATIO,
  canAllowPause,
  getAgentAvailabilityMetrics,
  PAUSE_BLOCKED_MESSAGE,
};
