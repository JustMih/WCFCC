/**
 * Matches Asterisk Queue(...,300,queue-exit). CDR/queue_log sums are often
 * 288–299s on a full timeout; classify those as lost and show 5.0 min.
 */
const QUEUE_EXIT_TIMEOUT_SECONDS = 300;
/** Seconds below dialplan timeout still treated as full-queue (lost). */
const LOST_CLASSIFY_GRACE_SECONDS = 12;

/** Lost when wait >= this (300 − 12 = 288). Dropped when wait < this. */
const LOST_MIN_DURATION_SECONDS =
  QUEUE_EXIT_TIMEOUT_SECONDS - LOST_CLASSIFY_GRACE_SECONDS;

function hasKnownQueueWait(waitSeconds) {
  const w = Number(waitSeconds);
  return Number.isFinite(w) && w > 0;
}

/** Bump near-timeout waits to full queue exit for classify + reports. */
function normalizeQueueWaitSeconds(waitSeconds) {
  const w = Math.floor(Number(waitSeconds) || 0);
  if (w <= 0) return 0;
  if (w >= LOST_MIN_DURATION_SECONDS) {
    return QUEUE_EXIT_TIMEOUT_SECONDS;
  }
  return w;
}

function isLostWaitSeconds(waitSeconds) {
  return (
    hasKnownQueueWait(waitSeconds) &&
    Number(waitSeconds) >= LOST_MIN_DURATION_SECONDS
  );
}

function isDroppedWaitSeconds(waitSeconds) {
  return (
    hasKnownQueueWait(waitSeconds) &&
    Number(waitSeconds) < LOST_MIN_DURATION_SECONDS
  );
}

function queueWaitToMinutes(waitSeconds) {
  const normalized = normalizeQueueWaitSeconds(waitSeconds);
  if (normalized <= 0) return 0;
  if (normalized >= QUEUE_EXIT_TIMEOUT_SECONDS) {
    return QUEUE_EXIT_TIMEOUT_SECONDS / 60;
  }
  return Math.round((normalized / 60) * 100) / 100;
}

module.exports = {
  QUEUE_EXIT_TIMEOUT_SECONDS,
  LOST_CLASSIFY_GRACE_SECONDS,
  LOST_MIN_DURATION_SECONDS,
  hasKnownQueueWait,
  normalizeQueueWaitSeconds,
  isLostWaitSeconds,
  isDroppedWaitSeconds,
  queueWaitToMinutes,
};
