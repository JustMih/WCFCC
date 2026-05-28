/** Server-side pause duration config (keep in sync with WCFFinal/src/utils/pauseActivities.js) */

const PAUSE_DURATIONS_MIN = {
  breakfast: 15,
  lunch: 45,
  shortCall: 10,
  followUp: 15,
  attendingMeeting: 30,
  emergency: 20,
};

const mapActivityToTimerKey = (activity) => {
  switch ((activity || "").toLowerCase()) {
    case "breakfast":
      return "breakfast";
    case "lunch":
      return "lunch";
    case "short call":
      return "shortCall";
    case "follow-up of customer inquiries":
      return "followUp";
    case "attending meeting":
      return "attendingMeeting";
    case "emergency":
      return "emergency";
    default:
      return null;
  }
};

const getAllowedSecondsForActivity = (activity) => {
  const key = mapActivityToTimerKey(activity);
  if (!key) return 0;
  return (PAUSE_DURATIONS_MIN[key] || 0) * 60;
};

const computePauseLiveMetrics = (user) => {
  const activity = user.pause_activity;
  const startedAt = user.pause_started_at;
  const allowed =
    user.pause_allowed_seconds != null
      ? user.pause_allowed_seconds
      : getAllowedSecondsForActivity(activity);

  if (!activity || !startedAt || !allowed) {
    return {
      pause_allowed_seconds: allowed || null,
      remaining_seconds: 0,
      exceeded_seconds: 0,
      is_exceeded: false,
    };
  }

  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) {
    return {
      pause_allowed_seconds: allowed,
      remaining_seconds: allowed,
      exceeded_seconds: 0,
      is_exceeded: false,
    };
  }

  const elapsed = Math.floor((Date.now() - started) / 1000);
  const remaining = Math.max(0, allowed - elapsed);
  const exceeded = Math.max(0, elapsed - allowed);

  return {
    pause_allowed_seconds: allowed,
    remaining_seconds: remaining,
    exceeded_seconds: exceeded,
    is_exceeded: exceeded > 0,
  };
};

module.exports = {
  PAUSE_DURATIONS_MIN,
  mapActivityToTimerKey,
  getAllowedSecondsForActivity,
  computePauseLiveMetrics,
};
