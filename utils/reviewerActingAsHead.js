function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isPublicRelationUnit(name) {
  return normalizeText(name).includes("public relation");
}

/**
 * Reviewer who heads Public Relation Unit acts as head-of-unit after rating + forward.
 */
function isReviewerActingAsHeadOfUnit({ userRole, userId, userUnitSection, ticket }) {
  if (!ticket || normalizeText(userRole) !== "reviewer" || !userId) {
    return false;
  }

  if (!ticket.complaint_type) {
    return false;
  }

  if (String(ticket.assigned_to_id || "") !== String(userId)) {
    return false;
  }

  const ticketUnit =
    ticket.sub_section || ticket.responsible_unit_name || ticket.section || "";
  const userUnit = userUnitSection || "";

  if (!isPublicRelationUnit(ticketUnit) && !isPublicRelationUnit(userUnit)) {
    return false;
  }

  const assignedRole = normalizeText(ticket.assigned_to_role);
  if (assignedRole === "head-of-unit") {
    return true;
  }

  return ["forwarded", "assigned"].includes(normalizeText(ticket.status));
}

function getEffectiveActionRole(user, ticket) {
  if (!user) return null;

  if (
    isReviewerActingAsHeadOfUnit({
      userRole: user.role,
      userId: user.id || user.userId,
      userUnitSection: user.unit_section,
      ticket,
    })
  ) {
    return "head-of-unit";
  }

  return user.role || null;
}

module.exports = {
  isPublicRelationUnit,
  isReviewerActingAsHeadOfUnit,
  getEffectiveActionRole,
};
