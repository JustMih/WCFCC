/**
 * Utility functions for calculating assignment aging
 */

const DEFAULT_WORK_TIMEZONE = "Africa/Dar_es_Salaam";

/**
 * Calendar date key YYYY-MM-DD in the given IANA timezone.
 * @param {Date|string|number} date
 * @param {string} timeZone
 * @returns {string|null}
 */
function toCalendarDateKey(date, timeZone = DEFAULT_WORK_TIMEZONE) {
  if (date == null || date === "") return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

/**
 * Weekday 0=Sun .. 6=Sat for a calendar date key (UTC noon avoids DST edge cases).
 * @param {string} dateKey YYYY-MM-DD
 * @returns {number}
 */
function weekdayFromDateKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/**
 * Add days to a calendar date key.
 * @param {string} dateKey YYYY-MM-DD
 * @param {number} days
 * @returns {string}
 */
function addCalendarDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * @param {Iterable<string|{holiday_date?: string}>} holidays
 * @param {string} timeZone
 * @returns {Set<string>}
 */
function normalizeHolidaySet(holidays, timeZone = DEFAULT_WORK_TIMEZONE) {
  const set = new Set();
  for (const h of holidays || []) {
    if (h == null) continue;
    if (typeof h === "string") {
      const trimmed = h.trim();
      if (trimmed.length >= 10) set.add(trimmed.slice(0, 10));
      else if (trimmed) set.add(trimmed);
      continue;
    }
    const raw = h.holiday_date ?? h;
    const key = toCalendarDateKey(raw, timeZone);
    if (key) set.add(key);
  }
  return set;
}

/**
 * Calculate the number of calendar days between two dates
 * @param {Date|string} startDate - The start date
 * @param {Date|string} endDate - The end date (defaults to current date)
 * @returns {number} Number of calendar days
 */
const calculateCalendarDays = (startDate, endDate = new Date()) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Calculate working days (Mon–Fri) between two dates in WCF timezone, excluding weekends and holidays.
 * @param {Date|string} startDate - Start (inclusive)
 * @param {Date|string} endDate - End (inclusive, defaults to now)
 * @param {string[]|Set<string>|object[]} holidays - YYYY-MM-DD strings or { holiday_date }
 * @param {string} timeZone - IANA timezone (default Africa/Dar_es_Salaam)
 * @returns {number}
 */
const calculateWorkingDays = (
  startDate,
  endDate = new Date(),
  holidays = [],
  timeZone = DEFAULT_WORK_TIMEZONE
) => {
  const startKey = toCalendarDateKey(startDate, timeZone);
  const endKey = toCalendarDateKey(endDate, timeZone);
  if (!startKey || !endKey || endKey < startKey) return 0;

  const holidaySet = normalizeHolidaySet(holidays, timeZone);
  let count = 0;
  let current = startKey;

  while (current <= endKey) {
    const wd = weekdayFromDateKey(current);
    const isWeekend = wd === 0 || wd === 6;
    if (!isWeekend && !holidaySet.has(current)) count++;
    if (current === endKey) break;
    current = addCalendarDays(current, 1);
  }

  return count;
};

/**
 * Calculate business hours between two dates (assuming 8-hour workday)
 * @param {Date|string} startDate - The start date
 * @param {Date|string} endDate - The end date (defaults to current date)
 * @param {number} workHoursPerDay - Hours per workday (default: 8)
 * @returns {number} Number of business hours
 */
const calculateBusinessHours = (startDate, endDate = new Date(), workHoursPerDay = 8) => {
  const workingDays = calculateWorkingDays(startDate, endDate);
  return workingDays * workHoursPerDay;
};

/**
 * Calculate aging for a single assignment
 * @param {Object} assignment - Assignment object with created_at
 * @param {Date|string} endDate - End date for calculation (defaults to current date)
 * @param {string} type - Type of aging calculation ('calendar', 'working', 'business')
 * @param {string[]} holidays - Array of holiday dates (optional)
 * @returns {Object} Aging information
 */
const calculateAssignmentAging = (assignment, endDate = new Date(), type = 'calendar', holidays = []) => {
  if (!assignment || !assignment.created_at) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      type: type,
      startDate: null,
      endDate: endDate
    };
  }

  const startDate = new Date(assignment.created_at);
  const end = new Date(endDate);

  let days = 0;
  let hours = 0;
  let minutes = 0;

  switch (type) {
    case 'working':
      days = calculateWorkingDays(startDate, end, holidays);
      hours = days * 8; // Assuming 8-hour workday
      break;
    case 'business':
      hours = calculateBusinessHours(startDate, end);
      days = Math.floor(hours / 8);
      break;
    case 'calendar':
    default:
      days = calculateCalendarDays(startDate, end);
      const totalHours = Math.abs(end - startDate) / (1000 * 60 * 60);
      hours = Math.floor(totalHours);
      minutes = Math.floor((totalHours - hours) * 60);
      break;
  }

  return {
    days,
    hours,
    minutes,
    type,
    startDate: startDate,
    endDate: end,
    isOverdue: days > 0 // You can customize overdue logic based on SLA
  };
};

/**
 * Calculate aging for multiple assignments
 * @param {Array} assignments - Array of assignment objects
 * @param {Date|string} endDate - End date for calculation (defaults to current date)
 * @param {string} type - Type of aging calculation ('calendar', 'working', 'business')
 * @param {string[]} holidays - Array of holiday dates (optional)
 * @returns {Array} Array of assignments with aging information
 */
const calculateAssignmentsAging = (assignments, endDate = new Date(), type = 'calendar', holidays = []) => {
  if (!Array.isArray(assignments)) {
    return [];
  }

  return assignments.map(assignment => ({
    ...assignment,
    aging: calculateAssignmentAging(assignment, endDate, type, holidays)
  }));
};

/**
 * Get aging status based on SLA rules
 * @param {number} days - Number of days
 * @param {string} category - Ticket category (Inquiry, Complaint, etc.)
 * @param {string} complaintType - Complaint type (Minor, Major) - for complaints only
 * @returns {string} Status: 'On Time', 'Warning', 'Overdue', 'Critical'
 */
const getAgingStatus = (days, category, complaintType = null) => {
  // Define SLA rules (in days)
  const SLA_RULES = {
    'Inquiry': 3,
    'Complaint': {
      'Minor': 7,
      'Major': 15
    },
    'Suggestion': 5,
    'Compliment': 3
  };

  let slaDays = 0;
  
  if (category === 'Complaint' && complaintType) {
    slaDays = SLA_RULES.Complaint[complaintType] || 7;
  } else {
    slaDays = SLA_RULES[category] || 5;
  }

  if (days <= slaDays) {
    return 'On Time';
  } else if (days <= slaDays * 1.5) {
    return 'Warning';
  } else if (days <= slaDays * 2) {
    return 'Overdue';
  } else {
    return 'Critical';
  }
};

/**
 * Format aging for display
 * @param {Object} aging - Aging object from calculateAssignmentAging
 * @returns {string} Formatted aging string
 */
const formatAging = (aging) => {
  if (!aging || aging.days === 0) {
    return '0 days';
  }

  const parts = [];
  
  if (aging.days > 0) {
    parts.push(`${aging.days} day${aging.days !== 1 ? 's' : ''}`);
  }
  
  if (aging.hours > 0 && aging.type === 'calendar') {
    parts.push(`${aging.hours} hour${aging.hours !== 1 ? 's' : ''}`);
  }
  
  if (aging.minutes > 0 && aging.type === 'calendar') {
    parts.push(`${aging.minutes} minute${aging.minutes !== 1 ? 's' : ''}`);
  }

  return parts.join(', ');
};

module.exports = {
  DEFAULT_WORK_TIMEZONE,
  toCalendarDateKey,
  weekdayFromDateKey,
  addCalendarDays,
  normalizeHolidaySet,
  calculateCalendarDays,
  calculateWorkingDays,
  calculateBusinessHours,
  calculateAssignmentAging,
  calculateAssignmentsAging,
  getAgingStatus,
  formatAging,
}; 