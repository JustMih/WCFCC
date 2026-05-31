/**
 * Off-hours classification matching Asterisk time-based routing:
 * - Public holidays → IVR (all day)
 * - Sunday → IVR (all day)
 * - Saturday outside 09:00–13:00 → IVR
 * - Mon–Fri outside 08:00–20:00 → IVR
 */

const CATEGORY_LABELS = {
  public_holiday: "Public Holiday",
  sunday: "Sunday",
  saturday_outside_hours: "Saturday (Outside Hours)",
  weekday_after_hours: "Weekday After Hours",
};

function toDateString(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getAsteriskDayOfWeek(date) {
  const jsDay = new Date(date).getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function getTimeHM(date) {
  const d = new Date(date);
  return d.getHours() * 100 + d.getMinutes();
}

function getOffHoursCategory(timestamp, holidayDates) {
  if (!timestamp) return null;

  const dateStr = toDateString(timestamp);
  const asteriskDay = getAsteriskDayOfWeek(timestamp);
  const timeHM = getTimeHM(timestamp);

  if (holidayDates.has(dateStr)) {
    return "public_holiday";
  }
  if (asteriskDay === 7) {
    return "sunday";
  }
  if (asteriskDay === 6) {
    if (timeHM < 900 || timeHM >= 1300) {
      return "saturday_outside_hours";
    }
    return null;
  }
  if (asteriskDay >= 1 && asteriskDay <= 5) {
    if (timeHM < 800 || timeHM >= 2000) {
      return "weekday_after_hours";
    }
    return null;
  }
  return null;
}

function buildHolidaySet(holidays) {
  const set = new Set();
  for (const h of holidays) {
    const raw = h.holiday_date || h;
    if (raw) set.add(toDateString(raw));
  }
  return set;
}

function filterOffHoursRecords(records, timestampField, holidayDates) {
  return records
    .map((record) => {
      const ts = record[timestampField];
      const category = getOffHoursCategory(ts, holidayDates);
      if (!category) return null;
      return {
        ...record,
        off_hours_category: category,
        off_hours_label: CATEGORY_LABELS[category],
      };
    })
    .filter(Boolean);
}

function buildSummary(records) {
  const summary = {
    total: records.length,
    public_holiday: 0,
    sunday: 0,
    saturday_outside_hours: 0,
    weekday_after_hours: 0,
    callbacks_pending: 0,
    callbacks_done: 0,
  };
  for (const r of records) {
    if (summary[r.off_hours_category] !== undefined) {
      summary[r.off_hours_category]++;
    }
    const st = r.callback_status || r.status;
    if (st === "pending") summary.callbacks_pending++;
    if (st === "called_back") summary.callbacks_done++;
  }
  return summary;
}

module.exports = {
  CATEGORY_LABELS,
  getOffHoursCategory,
  buildHolidaySet,
  filterOffHoursRecords,
  buildSummary,
};
