/**
 * Ticket Workflow TAT report — template columns aligned to TAT sample.xlsx.
 */

const {
  TAT_TEMPLATE_COLUMNS,
  normalizeRoleForSlot,
  getSlotForwardKey,
  getSlotTatKey,
  createEmptyTemplateRow,
} = require("./tatTemplateConfig");

const WORKFLOW_PATH_LABELS = {
  MINOR_UNIT: "Minor Complaint - Unit",
  MINOR_DIRECTORATE: "Minor Complaint - Directorate",
  MAJOR_UNIT: "Major Complaint - Unit",
  MAJOR_DIRECTORATE: "Major Complaint - Directorate",
};

const MS_PER_DAY = 86400000;

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

function durationToDays(ms) {
  if (!ms || ms <= 0) return 0;
  return Math.round(ms / MS_PER_DAY);
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

function computeStepDurationMs(stepStart, stepEnd) {
  const start = parseDate(stepStart);
  const end = parseDate(stepEnd);
  if (!start || !end) return 0;
  return Math.max(0, end.getTime() - start.getTime());
}

function isWorkflowForwardAssignment(assignment) {
  const action = String(assignment?.action || "Assigned").toLowerCase();
  if (action.includes("handover")) return false;
  if (action === "closed") return false;
  return true;
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
      role: a.assigned_to_role || a.workflow_current_role || "N/A",
      rawRole: a.assigned_to_role || a.workflow_current_role || "N/A",
      action: a.action || "Assigned",
      startedAt: parseDate(a.created_at),
    })),
  ];

  return rawSteps.map((step, idx) => {
    const nextStart =
      idx < rawSteps.length - 1 ? rawSteps[idx + 1].startedAt : ticketEnd;
    const durationMs = computeStepDurationMs(step.startedAt, nextStart);

    return {
      stepNumber: idx + 1,
      person: step.person,
      role: step.role,
      rawRole: step.rawRole,
      action: step.action,
      startedAt: step.startedAt,
      durationMs,
      durationDays: durationToDays(durationMs),
    };
  });
}

function buildTemplateRowFromSteps(ticket, steps) {
  const row = createEmptyTemplateRow();
  const ticketStart =
    parseDate(ticket.created_at) ||
    parseDate(ticket.request_registered_date) ||
    null;
  const resolvedAt = getResolvedAt(ticket);
  const closingDate = resolvedAt || getTicketEndDate(ticket);

  row.created_date = toIsoDate(ticketStart);
  row.fin_year = computeFiscalYear(ticketStart);

  const firstAssignment = steps.find((s) => s.stepNumber > 1);
  if (firstAssignment?.startedAt) {
    row.creator_forward_date = toIsoDate(firstAssignment.startedAt);
    if (ticketStart) {
      row.tat_creator = durationToDays(
        computeStepDurationMs(ticketStart, firstAssignment.startedAt)
      );
    }
  }

  for (const step of steps) {
    if (step.stepNumber === 1) continue;

    const slot = normalizeRoleForSlot(step.rawRole);
    if (!slot || slot === "creator") continue;

    const forwardKey = getSlotForwardKey(slot);
    const tatKey = getSlotTatKey(slot);
    if (!forwardKey || !tatKey) continue;

    // Last visit wins when role repeats in forward/reverse flow.
    row[forwardKey] = toIsoDate(step.startedAt);
    row[tatKey] = step.durationDays;
  }

  row.closing_date = toIsoDate(closingDate);
  if (ticketStart && closingDate) {
    row.tat_overall = durationToDays(
      computeStepDurationMs(ticketStart, closingDate)
    );
  }

  return row;
}

function getWorkflowPathLabel(pathKey) {
  if (!pathKey) return "—";
  return WORKFLOW_PATH_LABELS[pathKey] || String(pathKey).replace(/_/g, " ");
}

function buildTatReportRow(ticket, assignments, serialIndex) {
  const steps = buildWorkflowSteps(ticket, assignments);
  const templateRow = buildTemplateRowFromSteps(ticket, steps);
  const resolvedAt = getResolvedAt(ticket);

  return {
    serial: serialIndex + 1,
    id: ticket.id,
    ticket_id: ticket.ticket_id || ticket.id,
    ticket_number:
      ticket.ticket_id ||
      (ticket.id ? `TKT-${String(ticket.id).substring(0, 8)}` : "—"),
    subject: ticket.subject || "—",
    category: ticket.category || "—",
    complaint_type: ticket.complaint_type || "—",
    workflow_path: ticket.workflow_path || null,
    workflow_path_label: getWorkflowPathLabel(ticket.workflow_path),
    status: ticket.status || "—",
    is_resolved: isTicketResolved(ticket),
    resolved_at: resolvedAt ? resolvedAt.toISOString() : null,
    step_count: steps.length,
    ...templateRow,
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

  return { total, resolved, avgTotalTatDays, avgTotalTatMinutes: avgTotalTatDays * 24 * 60 };
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

function buildTatReportPayload(tickets, assignments) {
  const byTicket = groupAssignmentsByTicketId(assignments);
  const rows = (tickets || []).map((ticket, index) =>
    buildTatReportRow(ticket, byTicket[ticket.id] || [], index)
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
  durationToDays,
  computeFiscalYear,
  buildTatReportRow,
  buildTatReportSummary,
  buildTatReportPayload,
  groupAssignmentsByTicketId,
};
