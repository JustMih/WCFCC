/**
 * Full TAT report columns — aligned to TAT sample.xlsx template.
 */

const HEADERS = {
  CATEGORY: "Category",
  RATED: "Rated (Minor/Major)",
  CHANNEL: "Channel",
  CREATED_DATE: "Created",
  CREATOR_FORWARD_DATE: "Creator Fwd",
  COORD_ASS_DATE: "Coord Ass",
  DIR_HEAD_ASS_DATE: "Dir/Head Ass",
  MGR_ASS_DATE: "Mgr Ass",
  FOCAL_ASS_DATE: "Focal Ass",
  ATTENDEE_DATE: "Attendee",
  MGR_RES_DATE: "Mgr Res",
  DIR_HEAD_RES_DATE: "Dir/Head Res",
  DG_DATE: "DG",
  CLOSING_DATE: "Closed",
  TAT_ASS_CREATOR: "TAT Ass Creator",
  TAT_ASS_COORD: "TAT Ass Coord",
  TAT_ASS_DIR_HEAD: "TAT Ass Dir/Head",
  TAT_ASS_MGR: "TAT Ass Mgr",
  TAT_ASS_FOCAL: "TAT Ass Focal",
  TAT_ATTENDEE: "TAT Attendee",
  TAT_MGR_RES: "TAT Mgr Res",
  TAT_DIR_HEAD_RES: "TAT Dir/Head Res",
  TAT_DG: "TAT DG",
  TAT_OVERALL_ASSIGNING: "Overall TAT Assigning (Created to Attendee)",
  TAT_OVERALL_ATTENDING: "Overall TAT Attending (Attendee to Closing)",
  TAT_OVERALL: "Overall TAT",
  FIN_YEAR: "Fin Year",
};

/** Dimension columns shown first in template */
const TAT_DIMENSION_COLUMNS = [
  { key: "category", header: HEADERS.CATEGORY, type: "text" },
  { key: "rated", header: HEADERS.RATED, type: "text" },
  { key: "channel", header: HEADERS.CHANNEL, type: "text" },
];

/** Milestone date columns */
const TAT_DATE_COLUMNS = [
  { key: "created_date", header: HEADERS.CREATED_DATE, type: "date" },
  { key: "creator_forward_date", header: HEADERS.CREATOR_FORWARD_DATE, type: "date" },
  { key: "coord_ass_date", header: HEADERS.COORD_ASS_DATE, type: "date", slot: "coord" },
  { key: "dir_head_ass_date", header: HEADERS.DIR_HEAD_ASS_DATE, type: "date", slot: "dir_head_ass" },
  { key: "mgr_ass_date", header: HEADERS.MGR_ASS_DATE, type: "date", slot: "mgr_ass" },
  { key: "focal_ass_date", header: HEADERS.FOCAL_ASS_DATE, type: "date", slot: "focal" },
  { key: "attendee_date", header: HEADERS.ATTENDEE_DATE, type: "date", slot: "attendee" },
  { key: "mgr_res_date", header: HEADERS.MGR_RES_DATE, type: "date", slot: "mgr_res" },
  { key: "dir_head_res_date", header: HEADERS.DIR_HEAD_RES_DATE, type: "date", slot: "dir_head_res" },
  { key: "dg_date", header: HEADERS.DG_DATE, type: "date", slot: "director_general" },
  { key: "closing_date", header: HEADERS.CLOSING_DATE, type: "date" },
];

/** TAT working-day columns */
const TAT_METRIC_COLUMNS = [
  { key: "tat_ass_creator", header: HEADERS.TAT_ASS_CREATOR, type: "tat", slot: "creator" },
  { key: "tat_ass_coord", header: HEADERS.TAT_ASS_COORD, type: "tat", slot: "coord" },
  { key: "tat_ass_dir_head", header: HEADERS.TAT_ASS_DIR_HEAD, type: "tat", slot: "dir_head_ass" },
  { key: "tat_ass_mgr", header: HEADERS.TAT_ASS_MGR, type: "tat", slot: "mgr_ass" },
  { key: "tat_ass_focal", header: HEADERS.TAT_ASS_FOCAL, type: "tat", slot: "focal" },
  { key: "tat_attendee", header: HEADERS.TAT_ATTENDEE, type: "tat", slot: "attendee" },
  { key: "tat_mgr_res", header: HEADERS.TAT_MGR_RES, type: "tat", slot: "mgr_res" },
  { key: "tat_dir_head_res", header: HEADERS.TAT_DIR_HEAD_RES, type: "tat", slot: "dir_head_res" },
  { key: "tat_dg", header: HEADERS.TAT_DG, type: "tat", slot: "director_general" },
  { key: "tat_overall_assigning", header: HEADERS.TAT_OVERALL_ASSIGNING, type: "tat" },
  { key: "tat_overall_attending", header: HEADERS.TAT_OVERALL_ATTENDING, type: "tat" },
  { key: "tat_overall", header: HEADERS.TAT_OVERALL, type: "tat" },
  { key: "fin_year", header: HEADERS.FIN_YEAR, type: "fin_year" },
];

const TAT_TEMPLATE_COLUMNS = [
  ...TAT_DIMENSION_COLUMNS,
  ...TAT_DATE_COLUMNS,
  ...TAT_METRIC_COLUMNS,
];

const LEGACY_COLUMN_KEYS = [
  "attendee_forwarded",
  "coordinator_forwarded",
  "director_head_forwarded",
  "manager_forwarded",
  "director_general_forwarded",
  "tat_creator",
  "tat_coordinator",
  "tat_director_head",
  "tat_manager",
  "tat_director_general",
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

/** Maps normalized slot + visit index to date column key */
const SLOT_DATE_KEY = {
  creator: { 1: "creator_forward_date" },
  coord: { 1: "coord_ass_date" },
  dir_head: { 1: "dir_head_ass_date", 2: "dir_head_res_date" },
  manager: { 1: "mgr_ass_date", 2: "mgr_res_date" },
  focal: { 1: "focal_ass_date" },
  attendee: { 1: "attendee_date" },
  director_general: { 1: "dg_date" },
};

/** Maps normalized slot + visit index to TAT column key */
const SLOT_TAT_KEY = {
  creator: { 1: "tat_ass_creator" },
  coord: { 1: "tat_ass_coord" },
  dir_head: { 1: "tat_ass_dir_head", 2: "tat_dir_head_res" },
  manager: { 1: "tat_ass_mgr", 2: "tat_mgr_res" },
  focal: { 1: "tat_ass_focal" },
  attendee: { 1: "tat_attendee" },
  director_general: { 1: "tat_dg" },
};

function normalizeRoleForSlot(role) {
  const r = String(role || "")
    .toLowerCase()
    .trim()
    .replace(/_/g, "-");
  if (!r || r === "creator") return "creator";
  if (r === "agent") return "creator";
  if (r === "reviewer" || r === "coordinator" || r === "supervisor") {
    return "coord";
  }
  if (
    r === "head-of-unit" ||
    r === "head of unit" ||
    r === "director" ||
    r === "headofunit"
  ) {
    return "dir_head";
  }
  if (r === "manager") return "manager";
  if (
    r === "focal-person" ||
    r === "focal person" ||
    r === "claim-focal-person" ||
    r === "compliance-focal-person"
  ) {
    return "focal";
  }
  if (r === "attendee") return "attendee";
  if (r === "director-general" || r === "director general" || r === "dg") {
    return "director_general";
  }
  return null;
}

function getSlotDateKey(slot, visitIndex = 1) {
  const map = SLOT_DATE_KEY[slot];
  if (!map) return null;
  return map[visitIndex] || null;
}

function getSlotTatKey(slot, visitIndex = 1) {
  const map = SLOT_TAT_KEY[slot];
  if (!map) return null;
  return map[visitIndex] || null;
}

function getVisitIndexForSlot(slot, visitCounts) {
  const base = slot === "dir_head" ? "dir_head" : slot === "manager" ? "manager" : slot;
  const count = (visitCounts[base] || 0) + 1;
  visitCounts[base] = count;
  return count;
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
  TAT_DIMENSION_COLUMNS,
  TAT_DATE_COLUMNS,
  TAT_METRIC_COLUMNS,
  TAT_TEMPLATE_COLUMNS,
  LEGACY_COLUMN_KEYS,
  SLOT_DATE_KEY,
  SLOT_TAT_KEY,
  normalizeRoleForSlot,
  getSlotDateKey,
  getSlotTatKey,
  getVisitIndexForSlot,
  createEmptyTemplateRow,
  rowToTemplateHeaders,
};
