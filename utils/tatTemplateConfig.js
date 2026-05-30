/**
 * Compact TAT report columns — one slot per role, short headers.
 */

const HEADERS = {
  CREATED_DATE: "Created",
  CREATOR_FORWARD_DATE: "Creator Fwd",
  ATTENDEE_FORWARDED: "Attendee Fwd",
  COORDINATOR_FORWARDED: "Coord Fwd",
  DIRECTOR_HEAD_FORWARDED: "Dir/Head Fwd",
  MANAGER_FORWARDED: "Mgr Fwd",
  DIRECTOR_GENERAL_FORWARDED: "DG Fwd",
  CLOSING_DATE: "Closed",
  TAT_CREATOR: "TAT Creator",
  TAT_ATTENDEE: "TAT Attendee",
  TAT_COORDINATOR: "TAT Coord",
  TAT_DIRECTOR_HEAD: "TAT Dir/Head",
  TAT_MANAGER: "TAT Mgr",
  TAT_DIRECTOR_GENERAL: "TAT DG",
  TAT_OVERALL: "TAT Total",
  FIN_YEAR: "Fin Year",
};

/** Ordered columns for UI/export (16 compact columns) */
const TAT_TEMPLATE_COLUMNS = [
  { key: "created_date", header: HEADERS.CREATED_DATE, type: "date" },
  { key: "creator_forward_date", header: HEADERS.CREATOR_FORWARD_DATE, type: "date" },
  { key: "attendee_forwarded", header: HEADERS.ATTENDEE_FORWARDED, type: "date", slot: "attendee" },
  { key: "coordinator_forwarded", header: HEADERS.COORDINATOR_FORWARDED, type: "date", slot: "coordinator" },
  { key: "director_head_forwarded", header: HEADERS.DIRECTOR_HEAD_FORWARDED, type: "date", slot: "director_head" },
  { key: "manager_forwarded", header: HEADERS.MANAGER_FORWARDED, type: "date", slot: "manager" },
  { key: "director_general_forwarded", header: HEADERS.DIRECTOR_GENERAL_FORWARDED, type: "date", slot: "director_general" },
  { key: "closing_date", header: HEADERS.CLOSING_DATE, type: "date" },
  { key: "tat_creator", header: HEADERS.TAT_CREATOR, type: "tat", slot: "creator" },
  { key: "tat_attendee", header: HEADERS.TAT_ATTENDEE, type: "tat", slot: "attendee" },
  { key: "tat_coordinator", header: HEADERS.TAT_COORDINATOR, type: "tat", slot: "coordinator" },
  { key: "tat_director_head", header: HEADERS.TAT_DIRECTOR_HEAD, type: "tat", slot: "director_head" },
  { key: "tat_manager", header: HEADERS.TAT_MANAGER, type: "tat", slot: "manager" },
  { key: "tat_director_general", header: HEADERS.TAT_DIRECTOR_GENERAL, type: "tat", slot: "director_general" },
  { key: "tat_overall", header: HEADERS.TAT_OVERALL, type: "tat" },
  { key: "fin_year", header: HEADERS.FIN_YEAR, type: "fin_year" },
];

const LEGACY_COLUMN_KEYS = [
  "attendee_forwarded_1",
  "attendee_forwarded_2",
  "director_head_forwarded_1",
  "director_head_forwarded_2",
  "manager_forwarded_1",
  "manager_forwarded_2",
  "tat_attendee_1",
  "tat_attendee_2",
  "tat_director_head_1",
  "tat_director_head_2",
  "tat_manager_1",
  "tat_manager_2",
];

const SLOT_FORWARD_KEY = {
  creator: "creator_forward_date",
  attendee: "attendee_forwarded",
  coordinator: "coordinator_forwarded",
  director_head: "director_head_forwarded",
  manager: "manager_forwarded",
  director_general: "director_general_forwarded",
};

const SLOT_TAT_KEY = {
  creator: "tat_creator",
  attendee: "tat_attendee",
  coordinator: "tat_coordinator",
  director_head: "tat_director_head",
  manager: "tat_manager",
  director_general: "tat_director_general",
};

function normalizeRoleForSlot(role) {
  const r = String(role || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-");
  if (!r || r === "creator") return "creator";
  if (r === "agent") return "creator";
  if (r === "reviewer" || r === "coordinator") return "coordinator";
  if (r === "head-of-unit" || r === "head of unit" || r === "director") {
    return "director_head";
  }
  if (r === "manager") return "manager";
  if (r === "attendee") return "attendee";
  if (r === "director-general" || r === "director general") {
    return "director_general";
  }
  return null;
}

function getSlotForwardKey(slot) {
  return SLOT_FORWARD_KEY[slot] || null;
}

function getSlotTatKey(slot) {
  return SLOT_TAT_KEY[slot] || null;
}

function createEmptyTemplateRow() {
  const row = {};
  for (const col of TAT_TEMPLATE_COLUMNS) {
    row[col.key] = null;
  }
  return row;
}

function rowToTemplateHeaders(row) {
  const out = {};
  for (const col of TAT_TEMPLATE_COLUMNS) {
    out[col.header] = row[col.key] ?? "";
  }
  return out;
}

module.exports = {
  HEADERS,
  TAT_TEMPLATE_COLUMNS,
  LEGACY_COLUMN_KEYS,
  SLOT_FORWARD_KEY,
  SLOT_TAT_KEY,
  normalizeRoleForSlot,
  getSlotForwardKey,
  getSlotTatKey,
  createEmptyTemplateRow,
  rowToTemplateHeaders,
};
