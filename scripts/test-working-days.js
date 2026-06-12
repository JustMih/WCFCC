/**
 * Unit-style checks for weekday + holiday working-day calculation.
 * Usage: node scripts/test-working-days.js
 */
const {
  calculateWorkingDays,
  toCalendarDateKey,
  DEFAULT_WORK_TIMEZONE,
} = require("../utils/agingCalculator");

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
  console.log(`  OK ${label} = ${actual}`);
}

function main() {
  const tz = DEFAULT_WORK_TIMEZONE;
  console.log(`Timezone: ${tz}\n`);

  // Sat 2026-06-06 → Sun 2026-06-07 (weekend only)
  assertEqual(
    "Sat–Sun weekend span",
    calculateWorkingDays("2026-06-06", "2026-06-07", [], tz),
    0
  );

  // Fri 2026-06-05 → Mon 2026-06-08
  assertEqual(
    "Fri–Mon (Fri + Mon)",
    calculateWorkingDays("2026-06-05", "2026-06-08", [], tz),
    2
  );

  // Mon–Wed same week
  assertEqual(
    "Mon–Wed inclusive",
    calculateWorkingDays("2026-06-01", "2026-06-03", [], tz),
    3
  );

  // Holiday on a weekday excluded
  const holidays = ["2026-06-02"];
  assertEqual(
    "Mon–Wed with Tue holiday",
    calculateWorkingDays("2026-06-01", "2026-06-03", holidays, tz),
    2
  );

  // EAT: late Friday UTC may still be Friday in Dar es Salaam
  const friLateUtc = "2026-06-05T20:00:00.000Z";
  const monEarlyUtc = "2026-06-08T05:00:00.000Z";
  const friKey = toCalendarDateKey(friLateUtc, tz);
  const monKey = toCalendarDateKey(monEarlyUtc, tz);
  assertEqual(
    `EAT calendar keys (${friKey} → ${monKey})`,
    calculateWorkingDays(friLateUtc, monEarlyUtc, [], tz),
    2
  );

  console.log("\nAll working-day tests passed.");
}

try {
  main();
} catch (e) {
  console.error("\nFAILED:", e.message);
  process.exit(1);
}
