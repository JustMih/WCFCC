/**
 * Ticket Workflow TAT report — template columns aligned to TAT sample.xlsx.
 */

const { calculateWorkingDays } = require("./agingCalculator");
const {
  TAT_TEMPLATE_COLUMNS,
  normalizeRoleForSlot,
  getSlotDateKey,
  getSlotTatKey,
  createEmptyTemplateRow,
} = require("./tatTemplateConfig");

const WORKFLOW_PATH_LABELS = {
  MINOR_UNIT: "Minor Complaint - Unit",
  MINOR_DIRECTORATE: "Minor Complaint - Directorate",
  MAJOR_UNIT: "Major Complaint - Unit",
  MAJOR_DIRECTORATE: "Major Complaint - Directorate",
};

const CREATOR_ROLE_CHANNEL_MAP = {
  agent: "Call",
  supervisor: "Call",
  attendee: "Walk-in",
  reviewer: "Call",
  admin: "Call",
  "super-admin": "Call",
  "focal-person": "In-System",
  "claim-focal-person": "In-System",
  "compliance-focal-person": "In-System",
  "head-of-unit": "In-System",
  director: "In-System",
  manager: "In-System",
  "director-general": "In-System",
};

/** Stored ticket.channel values → display label */
const CHANNEL_VALUE_ALIASES = {
  agent: "Call",
  call: "Call",
  "call center": "Call",
  "walk-in": "Walk-in",
  "walk in": "Walk-in",
  walkin: "Walk-in",
  "in-system": "In-System",
  "in system": "In-System",
  insystem: "In-System",
};

const IN_SYSTEM_SLOTS = new Set([
  "focal",
  "manager",
  "dir_head",
  "director_general",
  "coord",
]);

function normalizeRoleKey(role) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function channelFromRole(role) {
  const key = normalizeRoleKey(role);
  if (!key) return "";
  return CREATOR_ROLE_CHANNEL_MAP[key] || "";
}

function normalizeChannelLabel(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";

  const key = trimmed.toLowerCase();
  if (CHANNEL_VALUE_ALIASES[key]) {
    return CHANNEL_VALUE_ALIASES[key];
  }

  const fromRole = channelFromRole(key);
  if (fromRole) return fromRole;

  return trimmed;
}

function channelFromWorkflowSteps(steps = []) {
  for (const step of steps) {
    const slot = normalizeRoleForSlot(step?.rawRole || step?.role);
    if (slot === "attendee") return "Walk-in";
    if (slot === "creator" || slot === "coord") return "Call";
    if (slot && IN_SYSTEM_SLOTS.has(slot)) return "In-System";
  }
  return "";
}

function channelFromAssignments(assignments = []) {
  const sorted = [...(assignments || [])]
    .filter(isWorkflowForwardAssignment)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const assignment of sorted) {
    const role =
      assignment.assigned_to_role ||
      assignment.workflow_current_role ||
      assignment.assigned_user_role;
    const fromRole = channelFromRole(role);
    if (fromRole) return fromRole;

    const slot = normalizeRoleForSlot(role);
    if (slot === "attendee") return "Walk-in";
    if (slot === "creator" || slot === "coord") return "Call";
    if (slot && IN_SYSTEM_SLOTS.has(slot)) return "In-System";
  }

  return "";
}

function resolveChannel(ticket, options = {}) {
  const { assignments = [], steps = [] } = options;

  const fromDb = normalizeChannelLabel(ticket?.channel);
  if (fromDb) return fromDb;

  const roleCandidates = [
    ticket?.creator_role,
    ticket?.assigned_to_role,
    ticket?.created_by_role,
  ];

  for (const role of roleCandidates) {
    const fromRole = channelFromRole(role);
    if (fromRole) return fromRole;
  }

  const fromSteps = channelFromWorkflowSteps(steps);
  if (fromSteps) return fromSteps;

  const fromAssignments = channelFromAssignments(assignments);
  if (fromAssignments) return fromAssignments;

  return "";
}

function normalizeRatedValue(value) {
  if (value == null || value === "") return "";
  const v = String(value).trim();
  const lower = v.toLowerCase();
  if (lower === "minor") return "Minor";
  if (lower === "major") return "Major";
  return v;
}

function resolveRated(ticket) {
  const fromType = normalizeRatedValue(ticket?.complaint_type);
  if (fromType) return fromType;

  const path = String(ticket?.workflow_path || "").toUpperCase();
  if (path.startsWith("MINOR")) return "Minor";
  if (path.startsWith("MAJOR")) return "Major";

  const category = String(ticket?.category || "").trim();
  if (category && category !== "Complaint") return "";

  return "";
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoDate(value) {
  const d = parseDate(value);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function workingDaysBetween(start, end, holidays = []) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate) return 0;
  if (endDate < startDate) return 0;
  return calculateWorkingDays(startDate, endDate, holidays);
}

function computeFiscalYear(dateValue) {
  const d = parseDate(dateValue);
  if (!d) return null;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  if (month >= 7) {
    return `${year}/${year + 1}`;
  }
  return `${year - 1}/${year}`;
}

function getCreatorName(ticket) {
  if (ticket.creator_name) return ticket.creator_name;
  if (ticket.requester_name) return ticket.requester_name;
  if (ticket.full_name) return ticket.full_name;
  if (ticket.first_name && ticket.last_name) {
    return `${ticket.first_name} ${ticket.last_name}`.trim();
  }
  return ticket.requester || "Creator";
}

function getTicketEndDate(ticket) {
  return (
    parseDate(ticket.workflow_completed_at) ||
    parseDate(ticket.date_of_resolution) ||
    parseDate(ticket.resolved_at) ||
    (ticket.status === "Closed" ? parseDate(ticket.updated_at) : null) ||
    new Date()
  );
}

function getResolvedAt(ticket) {
  return (
    parseDate(ticket.workflow_completed_at) ||
    parseDate(ticket.date_of_resolution) ||
    parseDate(ticket.resolved_at) ||
    (ticket.status === "Closed" ? parseDate(ticket.updated_at) : null)
  );
}

function isTicketResolved(ticket) {
  return (
    ticket.workflow_completed === true ||
    ticket.workflow_completed === 1 ||
    ticket.status === "Closed"
  );
}

function isWorkflowForwardAssignment(assignment) {
  const action = String(assignment?.action || "Assigned").toLowerCase();
  if (action.includes("handover")) return false;
  if (action === "closed") return false;
  return true;
}

function getVisitIndex(slot, visitCounts) {
  if (slot === "dir_head" || slot === "manager") {
    const count = (visitCounts[slot] || 0) + 1;
    visitCounts[slot] = count;
    return count;
  }
  return 1;
}

function buildWorkflowSteps(ticket, assignments = []) {
  const sorted = [...(assignments || [])]
    .filter(isWorkflowForwardAssignment)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const ticketStart =
    parseDate(ticket.created_at) ||
    parseDate(ticket.request_registered_date) ||
    new Date();

  const ticketEnd = getTicketEndDate(ticket);

  const rawSteps = [
    {
      person: getCreatorName(ticket),
      role: "Creator",
      rawRole: "creator",
      action: "Created",
      startedAt: ticketStart,
    },
    ...sorted.map((a) => ({
      person: a.assigned_to_name || a.assigned_to_id || "Unknown",
      role:
        a.assigned_to_role ||
        a.workflow_current_role ||
        a.assigned_user_role ||
        "N/A",
      rawRole:
        a.assigned_to_role ||
        a.workflow_current_role ||
        a.assigned_user_role ||
        "N/A",
      action: a.action || "Assigned",
      startedAt: parseDate(a.created_at),
    })),
  ];

  return rawSteps.map((step, idx) => {
    const nextStart =
      idx < rawSteps.length - 1 ? rawSteps[idx + 1].startedAt : ticketEnd;
    return {
      stepNumber: idx + 1,
      person: step.person,
      role: step.role,
      rawRole: step.rawRole,
      action: step.action,
      startedAt: step.startedAt,
      nextStartedAt: nextStart,
    };
  });
}

function buildTemplateRowFromSteps(ticket, steps, holidays = []) {
  const holidayDates = Array.isArray(holidays) ? holidays : [];
  const row = createEmptyTemplateRow();
  const ticketStart =
    parseDate(ticket.created_at) ||
    parseDate(ticket.request_registered_date) ||
    null;
  const resolvedAt = getResolvedAt(ticket);
  const closingDate = resolvedAt || getTicketEndDate(ticket);

  row.category = ticket.category || "";
  row.rated = resolveRated(ticket);
  row.created_date = toIsoDate(ticketStart);
  row.fin_year = computeFiscalYear(ticketStart);
  row.closing_date = toIsoDate(closingDate);

  const firstAssignment = steps.find((s) => s.stepNumber > 1);
  if (firstAssignment?.startedAt) {
    row.creator_forward_date = toIsoDate(firstAssignment.startedAt);
    if (ticketStart) {
      row.tat_ass_creator = workingDaysBetween(
        ticketStart,
        firstAssignment.startedAt,
        holidayDates
      );
    }
  }

  const visitCounts = { dir_head: 0, manager: 0 };

  for (const step of steps) {
    if (step.stepNumber === 1) continue;

    const slot = normalizeRoleForSlot(step.rawRole);
    if (!slot || slot === "creator") continue;

    const visitIndex = getVisitIndex(slot, visitCounts);
    const dateKey = getSlotDateKey(slot, visitIndex);
    const tatKey = getSlotTatKey(slot, visitIndex);
    if (!dateKey || !tatKey) continue;

    row[dateKey] = toIsoDate(step.startedAt);
    row[tatKey] = workingDaysBetween(
      step.startedAt,
      step.nextStartedAt,
      holidayDates
    );
  }

  const attendeeDate = parseDate(row.attendee_date);
  const createdDate = parseDate(row.created_date);
  const closedDate = parseDate(row.closing_date);

  if (createdDate && attendeeDate) {
    row.tat_overall_assigning = workingDaysBetween(
      createdDate,
      attendeeDate,
      holidayDates
    );
  }
  if (attendeeDate && closedDate) {
    row.tat_overall_attending = workingDaysBetween(
      attendeeDate,
      closedDate,
      holidayDates
    );
  }
  if (createdDate && closedDate) {
    row.tat_overall = workingDaysBetween(createdDate, closedDate, holidayDates);
  }

  return row;
}

function getWorkflowPathLabel(pathKey) {
  if (!pathKey) return "—";
  return WORKFLOW_PATH_LABELS[pathKey] || String(pathKey).replace(/_/g, " ");
}

function buildTatReportRow(ticket, assignments, serialIndex, holidays = []) {
  const steps = buildWorkflowSteps(ticket, assignments);
  const channel = resolveChannel(ticket, { assignments, steps });
  const templateRow = buildTemplateRowFromSteps(ticket, steps, holidays);
  templateRow.channel = channel;
  const resolvedAt = getResolvedAt(ticket);
  const rated = resolveRated(ticket);

  return {
    serial: serialIndex + 1,
    id: ticket.id,
    ticket_id: ticket.ticket_id || ticket.id,
    ticket_number:
      ticket.ticket_id ||
      (ticket.id ? `TKT-${String(ticket.id).substring(0, 8)}` : "—"),
    subject: ticket.subject || "—",
    workflow_path: ticket.workflow_path || null,
    workflow_path_label: getWorkflowPathLabel(ticket.workflow_path),
    status: ticket.status || "—",
    is_resolved: isTicketResolved(ticket),
    resolved_at: resolvedAt ? resolvedAt.toISOString() : null,
    step_count: steps.length,
    ...templateRow,
    category: ticket.category || templateRow.category || "",
    rated,
    channel,
    complaint_type: rated || ticket.complaint_type || "",
  };
}

function buildTatReportSummary(rows) {
  const total = rows.length;
  const resolved = rows.filter((r) => r.is_resolved).length;
  const withTat = rows.filter((r) => (r.tat_overall || 0) > 0);
  const avgTotalTatDays =
    withTat.length > 0
      ? Math.round(
          withTat.reduce((sum, r) => sum + (r.tat_overall || 0), 0) /
            withTat.length
        )
      : 0;

  return {
    total,
    resolved,
    avgTotalTatDays,
    avgTotalTatMinutes: avgTotalTatDays * 24 * 60,
  };
}

function groupAssignmentsByTicketId(assignments) {
  const map = {};
  for (const a of assignments || []) {
    const key = a.ticket_id;
    if (!key) continue;
    if (!map[key]) map[key] = [];
    map[key].push(a);
  }
  return map;
}

function buildTatReportPayload(tickets, assignments, options = {}) {
  const holidays = options.holidays || [];
  const byTicket = groupAssignmentsByTicketId(assignments);
  const rows = (tickets || []).map((ticket, index) =>
    buildTatReportRow(ticket, byTicket[ticket.id] || [], index, holidays)
  );
  return {
    summary: buildTatReportSummary(rows),
    rows,
    templateColumns: TAT_TEMPLATE_COLUMNS,
  };
}

module.exports = {
  WORKFLOW_PATH_LABELS,
  TAT_TEMPLATE_COLUMNS,
  buildWorkflowSteps,
  buildTemplateRowFromSteps,
  workingDaysBetween,
  computeFiscalYear,
  buildTatReportRow,
  buildTatReportSummary,
  buildTatReportPayload,
  groupAssignmentsByTicketId,
  resolveRated,
  resolveChannel,
};
