/**
 * Utility functions for calculating assignment aging
 */


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
 * Calculate the number of working days (Mon-Fri) between two dates, excluding weekends
 * @param {Date|string} startDate - The start date (inclusive)
 * @param {Date|string} endDate - The end date (inclusive, defaults to current date)
 * @param {string[]} holidays - Array of holiday dates in 'YYYY-MM-DD' format (optional)
 * @returns {number} Number of working days
 */
const calculateWorkingDays = (startDate, endDate = new Date(), holidays = []) => {
  let count = 0;
  let current = new Date(startDate);
  const end = new Date(endDate);
  const holidaySet = new Set(
    (holidays || []).map((h) => new Date(h).toDateString())
  );
  
  while (current <= end) {
    const day = current.getDay();
    const isWeekend = day === 0 || day === 6; // Sunday = 0, Saturday = 6
    const isHoliday = holidaySet.has(current.toDateString());
    if (!isWeekend && !isHoliday) count++;
    current.setDate(current.getDate() + 1);
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
  calculateCalendarDays,
  calculateWorkingDays,
  calculateBusinessHours,
  calculateAssignmentAging,
  calculateAssignmentsAging,
  getAgingStatus,
  formatAging
}; 