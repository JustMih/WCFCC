const { expireDueHandovers } = require("../services/handoverService");

const DEFAULT_INTERVAL_MS = 60 * 1000;

async function runHandoverExpiryCycle() {
  try {
    const expired = await expireDueHandovers();
    if (expired.length > 0) {
      console.log(`[handover-expiry] Processed ${expired.length} expired handover(s)`);
    }
  } catch (error) {
    console.error("[handover-expiry] cycle failed:", error.message);
  }
}

const intervalMs = Number(process.env.HANDOVER_EXPIRY_INTERVAL_MS) || DEFAULT_INTERVAL_MS;
setInterval(runHandoverExpiryCycle, intervalMs);

// Run one immediate cycle after startup.
setTimeout(runHandoverExpiryCycle, 10_000);

module.exports = { runHandoverExpiryCycle };
