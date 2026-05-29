const { Op } = require("sequelize");
const sequelize = require("../config/mysql_connection");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const TicketAssignment = require("../models/TicketAssignment");
const UserHandover = require("../models/UserHandover");
const Notification = require("../models/Notification");
const {
  sendEmailNonBlocking,
  renderEmailCard,
} = require("./emailService");

const ACTIVE_TICKET_STATUSES = [
  "Assigned",
  "Open",
  "Forwarded",
  "Attended and Recommended",
  "Reversed",
  "Returned",
  "Escalated",
  "In Progress",
  "Pending Review",
  "Pending Approval",
  "Carried Forward",
];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isHandoverParticipant(ticket, userId) {
  if (!ticket || !userId) return false;
  const hasActiveHandover = Boolean(ticket.handover_id && ticket.handover_effective_role);
  if (!hasActiveHandover) return ticket.assigned_to_id === userId;
  return ticket.assigned_to_id === userId || ticket.handover_from_user_id === userId;
}

function getTicketActorPolicy(ticket, userId, actorRole) {
  if (!ticket || !userId) {
    return {
      isParticipant: false,
      isDelegate: false,
      isOriginalOwner: false,
      canMutate: false,
      roleForChecks: normalizeRole(actorRole),
      blockReason: "Not allowed to act on this ticket",
    };
  }

  const hasActiveHandover = Boolean(ticket.handover_id && ticket.handover_effective_role);
  const isDelegate = ticket.assigned_to_id === userId;
  const isOriginalOwner = ticket.handover_from_user_id === userId;
  const isParticipant = hasActiveHandover
    ? isDelegate || isOriginalOwner
    : ticket.assigned_to_id === userId;

  if (!isParticipant) {
    return {
      isParticipant,
      isDelegate,
      isOriginalOwner,
      canMutate: false,
      roleForChecks: normalizeRole(actorRole),
      blockReason: "Not allowed to act on this ticket",
    };
  }

  if (hasActiveHandover && isOriginalOwner) {
    return {
      isParticipant,
      isDelegate,
      isOriginalOwner,
      canMutate: false,
      roleForChecks: normalizeRole(actorRole),
      blockReason: "You handed over this ticket. Revoke handover to continue actions.",
    };
  }

  return {
    isParticipant,
    isDelegate,
    isOriginalOwner,
    canMutate: true,
    roleForChecks:
      hasActiveHandover && isDelegate
        ? normalizeRole(ticket.handover_effective_role || ticket.assigned_to_role)
        : normalizeRole(actorRole || ticket.assigned_to_role),
    blockReason: null,
  };
}

function getActorRoleForTicket(ticket, userId, actorRole) {
  const normalizedActorRole = normalizeRole(actorRole);
  const isDelegate = ticket.assigned_to_id === userId;
  const hasActiveHandover = Boolean(ticket.handover_id && ticket.handover_effective_role);

  if (hasActiveHandover && isDelegate) {
    return normalizeRole(ticket.handover_effective_role || ticket.assigned_to_role);
  }
  return normalizedActorRole || normalizeRole(ticket.assigned_to_role);
}

function getEffectiveActorRole(ticket, userId, actorRole) {
  const policy = getTicketActorPolicy(ticket, userId, actorRole);
  return policy.roleForChecks || normalizeRole(actorRole);
}

function canReassignFromDelegate(ticket, fromUserId, toUserId) {
  return ticket.assigned_to_id === toUserId && ticket.handover_from_user_id === fromUserId;
}

async function logHandoverAudit(action, metadata) {
  try {
    const AuditLog = require("../models/AuditLog");
    await AuditLog.create({
      category: "handover",
      action,
      entityType: "UserHandover",
      entityId: metadata?.handoverId || null,
      status: "success",
      userId: metadata?.actorId || null,
      role: metadata?.actorRole || null,
      message: metadata?.message || null,
      metadata,
    });
  } catch (error) {
    console.error("[handover-audit] failed:", error.message);
  }
}

async function listActiveHandoverParticipants() {
  const rows = await UserHandover.findAll({
    where: { status: "active" },
    attributes: ["id", "from_user_id", "to_user_id"],
  });

  const blockedUserIds = new Set();
  const participants = [];

  for (const row of rows) {
    if (row.from_user_id) {
      const userId = String(row.from_user_id);
      blockedUserIds.add(userId);
      participants.push({
        userId: row.from_user_id,
        role: "initiator",
        handoverId: row.id,
      });
    }
    if (row.to_user_id) {
      const userId = String(row.to_user_id);
      blockedUserIds.add(userId);
      participants.push({
        userId: row.to_user_id,
        role: "delegate",
        handoverId: row.id,
      });
    }
  }

  return { blockedUserIds, participants };
}

async function validateHandoverStart({ fromUserId, toUserId, returnAt }) {
  if (!fromUserId || !toUserId || !returnAt) {
    throw new Error("from_user_id, to_user_id and return_at are required");
  }
  if (fromUserId === toUserId) {
    throw new Error("Cannot hand over to self");
  }
  const parsedReturnDate = new Date(returnAt);
  if (Number.isNaN(parsedReturnDate.getTime()) || parsedReturnDate <= new Date()) {
    throw new Error("return_at must be a future date");
  }

  const [fromUser, toUser] = await Promise.all([
    User.findByPk(fromUserId, { attributes: ["id", "role", "full_name", "email"] }),
    User.findByPk(toUserId, { attributes: ["id", "role", "full_name", "email"] }),
  ]);
  if (!fromUser || !toUser) {
    throw new Error("from_user_id or to_user_id does not exist");
  }

  const [
    existingFromActive,
    circular,
    fromUserAsDelegate,
    toUserAsInitiator,
    toUserAsDelegate,
  ] = await Promise.all([
    UserHandover.findOne({ where: { from_user_id: fromUserId, status: "active" } }),
    UserHandover.findOne({
      where: { from_user_id: toUserId, to_user_id: fromUserId, status: "active" },
    }),
    UserHandover.findOne({ where: { to_user_id: fromUserId, status: "active" } }),
    UserHandover.findOne({ where: { from_user_id: toUserId, status: "active" } }),
    UserHandover.findOne({ where: { to_user_id: toUserId, status: "active" } }),
  ]);

  if (existingFromActive) {
    throw new Error("Source user already has an active handover");
  }
  if (fromUserAsDelegate) {
    throw new Error(
      "You are currently a handover delegate and cannot start a new handover"
    );
  }
  if (circular) {
    throw new Error("Circular handover detected. Revoke existing reverse handover first.");
  }
  if (toUserAsInitiator) {
    throw new Error(
      `${toUser.full_name || "Selected user"} already has an active handover`
    );
  }
  if (toUserAsDelegate) {
    throw new Error(
      `${toUser.full_name || "Selected user"} is already acting as a handover delegate`
    );
  }

  return { fromUser, toUser, parsedReturnDate };
}

function formatHandoverReturnDate(date) {
  if (!date) return "N/A";
  try {
    return new Date(date).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(date);
  }
}

async function notifyDelegateOnHandoverStart({
  handover,
  fromUser,
  toUser,
  movedTicketCount,
  firstTicketId,
  reason,
  parsedReturnDate,
}) {
  if (!handover || !fromUser || !toUser) return;

  const fromName = fromUser.full_name || "A colleague";
  const returnLabel = formatHandoverReturnDate(parsedReturnDate);
  const roleLabel = fromUser.role || handover.from_user_role || "their role";
  const ticketLabel =
    movedTicketCount === 1 ? "1 ticket" : `${movedTicketCount || 0} tickets`;

  const notificationMessage = `Handover: ${fromName} handed over their tickets to you. You are acting as ${roleLabel} until ${returnLabel}.`;
  const notificationComment = [
    `From: ${fromName}`,
    `Tickets: ${movedTicketCount || 0}`,
    `Return: ${returnLabel}`,
    reason ? `Reason: ${reason}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  if (firstTicketId && movedTicketCount > 0) {
    await Notification.create({
      ticket_id: firstTicketId,
      sender_id: fromUser.id,
      recipient_id: toUser.id,
      message: notificationMessage,
      comment: notificationComment,
      channel: "system",
      status: "unread",
      category: "Handover",
    });
  } else if (movedTicketCount === 0) {
    console.log(
      `[handover-notify] No tickets moved for handover ${handover.id}; skipping in-app notification.`
    );
  }

  if (!toUser.email) {
    console.log(
      `[handover-notify] Delegate ${toUser.id} has no email; skipping handover email.`
    );
    return;
  }

  const emailSubject = `Handover: You have been delegated tickets from ${fromName}`;
  const bodyHtml = `
    <p>Hello <strong>${toUser.full_name || "User"}</strong>,</p>
    <p><strong>${fromName}</strong> has handed over ${ticketLabel} to you through the WCF Customer Care system.</p>
    <p>You will act in their capacity (<strong>${roleLabel}</strong>) until the scheduled return date.</p>
  `;
  const detailsHtml = `
    <ul>
      <li><strong>From:</strong> ${fromName} (${roleLabel})</li>
      <li><strong>Tickets delegated:</strong> ${movedTicketCount || 0}</li>
      <li><strong>Return date:</strong> ${returnLabel}</li>
      ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ""}
    </ul>
    <p>Please log in to review assigned tickets and continue work on their behalf.</p>
  `;
  const htmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);

  sendEmailNonBlocking({
    to: toUser.email,
    subject: emailSubject,
    htmlBody,
  });
}

async function startHandover({ fromUserId, toUserId, returnAt, reason, actorId, actorRole }) {
  const { fromUser, toUser, parsedReturnDate } = await validateHandoverStart({
    fromUserId,
    toUserId,
    returnAt,
  });

  const result = await sequelize.transaction(async (transaction) => {
    const handover = await UserHandover.create(
      {
        from_user_id: fromUserId,
        to_user_id: toUserId,
        from_user_role: fromUser.role,
        to_user_role: toUser.role,
        start_at: new Date(),
        return_at: parsedReturnDate,
        status: "active",
        reason: reason || null,
      },
      { transaction }
    );

    const tickets = await Ticket.findAll({
      where: {
        assigned_to_id: fromUserId,
        status: { [Op.in]: ACTIVE_TICKET_STATUSES },
      },
      transaction,
    });

    const ticketIds = tickets.map((t) => t.id);
    if (ticketIds.length > 0) {
      await Ticket.update(
        {
          assigned_to_id: toUserId,
          assigned_to: toUserId,
          assigned_to_role: toUser.role,
          handover_id: handover.id,
          handover_from_user_id: fromUserId,
          handover_effective_role: fromUser.role,
          status: "Assigned",
        },
        { where: { id: { [Op.in]: ticketIds } }, transaction }
      );

      await TicketAssignment.bulkCreate(
        ticketIds.map((ticketId) => ({
          ticket_id: ticketId,
          assigned_by_id: actorId || fromUserId,
          assigned_to_id: toUserId,
          assigned_to_role: fromUser.role,
          action: "handover_assign",
          reason:
            reason ||
            `Ticket temporarily handed over from ${fromUser.full_name} to ${toUser.full_name}`,
          action_details: JSON.stringify({
            handover_id: handover.id,
            from_user_id: fromUserId,
            from_user_role: fromUser.role,
            to_user_id: toUserId,
            to_user_role: toUser.role,
            return_at: parsedReturnDate,
          }),
          created_at: new Date(),
        })),
        { transaction }
      );
    }

    await logHandoverAudit("handover_start", {
      handoverId: handover.id,
      fromUserId,
      toUserId,
      movedTicketCount: ticketIds.length,
      actorId,
      actorRole,
      message: `Handover started from ${fromUser.full_name} to ${toUser.full_name}`,
    });

    return {
      handover,
      movedTicketCount: ticketIds.length,
      firstTicketId: ticketIds[0] || null,
    };
  });

  try {
    await notifyDelegateOnHandoverStart({
      handover: result.handover,
      fromUser,
      toUser,
      movedTicketCount: result.movedTicketCount,
      firstTicketId: result.firstTicketId,
      reason,
      parsedReturnDate,
    });
  } catch (error) {
    console.error("[handover-notify] failed:", error.message);
  }

  return {
    handover: result.handover,
    movedTicketCount: result.movedTicketCount,
  };
}

async function closeHandover({ handoverId, actorId, actorRole, mode = "revoked" }) {
  return sequelize.transaction(async (transaction) => {
    const handover = await UserHandover.findByPk(handoverId, { transaction });
    if (!handover) throw new Error("Handover not found");
    if (handover.status !== "active") throw new Error("Handover is not active");

    const fromUser = await User.findByPk(handover.from_user_id, {
      attributes: ["id", "role", "full_name"],
      transaction,
    });
    const toUser = await User.findByPk(handover.to_user_id, {
      attributes: ["id", "role", "full_name"],
      transaction,
    });
    if (!fromUser || !toUser) throw new Error("Invalid handover users");

    const tickets = await Ticket.findAll({
      where: {
        handover_id: handover.id,
        status: { [Op.in]: ACTIVE_TICKET_STATUSES },
      },
      transaction,
    });

    const returnableIds = tickets
      .filter((t) => canReassignFromDelegate(t, handover.from_user_id, handover.to_user_id))
      .map((t) => t.id);

    if (returnableIds.length > 0) {
      await Ticket.update(
        {
          assigned_to_id: handover.from_user_id,
          assigned_to: handover.from_user_id,
          assigned_to_role: handover.from_user_role,
          handover_id: null,
          handover_from_user_id: null,
          handover_effective_role: null,
          status: "Assigned",
        },
        { where: { id: { [Op.in]: returnableIds } }, transaction }
      );

      await TicketAssignment.bulkCreate(
        returnableIds.map((ticketId) => ({
          ticket_id: ticketId,
          assigned_by_id: actorId || handover.to_user_id,
          assigned_to_id: handover.from_user_id,
          assigned_to_role: handover.from_user_role,
          action: "handover_return",
          reason:
            mode === "expired"
              ? `Handover expired, ticket returned to ${fromUser.full_name}`
              : `Handover revoked, ticket returned to ${fromUser.full_name}`,
          action_details: JSON.stringify({
            handover_id: handover.id,
            mode,
            from_user_id: handover.from_user_id,
            to_user_id: handover.to_user_id,
          }),
          created_at: new Date(),
        })),
        { transaction }
      );
    }

    await handover.update(
      {
        status: mode,
        revoked_at: new Date(),
        revoked_by_id: actorId || null,
      },
      { transaction }
    );

    await logHandoverAudit(mode === "expired" ? "handover_expire" : "handover_revoke", {
      handoverId: handover.id,
      fromUserId: handover.from_user_id,
      toUserId: handover.to_user_id,
      returnedTicketCount: returnableIds.length,
      actorId,
      actorRole,
      message: `Handover ${mode} between ${fromUser.full_name} and ${toUser.full_name}`,
    });

    return { handover, returnedTicketCount: returnableIds.length };
  });
}

async function expireDueHandovers() {
  const due = await UserHandover.findAll({
    where: {
      status: "active",
      return_at: { [Op.lte]: new Date() },
    },
    attributes: ["id"],
  });
  const results = [];
  for (const handover of due) {
    try {
      const result = await closeHandover({ handoverId: handover.id, mode: "expired" });
      results.push({ handoverId: handover.id, ...result });
    } catch (error) {
      console.error(`[handover-expire] ${handover.id}:`, error.message);
    }
  }
  return results;
}

async function listActiveHandoversForUser(userId) {
  const where = userId
    ? {
        status: "active",
        [Op.or]: [{ from_user_id: userId }, { to_user_id: userId }],
      }
    : { status: "active" };

  return UserHandover.findAll({
    where,
    include: [
      { model: User, as: "fromUser", attributes: ["id", "full_name", "role"] },
      { model: User, as: "toUser", attributes: ["id", "full_name", "role"] },
      { model: User, as: "revokedBy", attributes: ["id", "full_name", "role"] },
    ],
    order: [["createdAt", "DESC"]],
  });
}

async function listActiveHandoversByActor({ actorId, actorRole, actorUnitSection }) {
  const normalizedRole = normalizeRole(actorRole);
  const baseInclude = [
    {
      model: User,
      as: "fromUser",
      attributes: ["id", "full_name", "role", "unit_section"],
    },
    {
      model: User,
      as: "toUser",
      attributes: ["id", "full_name", "role", "unit_section"],
    },
    { model: User, as: "revokedBy", attributes: ["id", "full_name", "role"] },
  ];

  if (!actorId) return [];

  const activeHandovers = await UserHandover.findAll({
    where: { status: "active" },
    include: baseInclude,
    order: [["createdAt", "DESC"]],
  });

  // Initiator/delegate should always see their involved handovers.
  const isActorInvolved = (handover) =>
    String(handover.from_user_id) === String(actorId) ||
    String(handover.to_user_id) === String(actorId);

  // Supervisor: section-scoped visibility + involved handovers.
  if (normalizedRole === "supervisor") {
    const section = String(actorUnitSection || "").trim();
    return activeHandovers.filter((handover) => {
      const sameSection =
        section && String(handover.fromUser?.unit_section || "") === section;
      return Boolean(sameSection) || isActorInvolved(handover);
    });
  }

  // All other roles: only involved handovers (initiator or delegate).
  return activeHandovers.filter(isActorInvolved);
}

function addEffectiveRole(ticketLike) {
  const ticket = ticketLike;
  const handoverActive = Boolean(ticket.handover_id && ticket.handover_effective_role);
  const effectiveRole = handoverActive
    ? normalizeRole(ticket.handover_effective_role)
    : normalizeRole(ticket.assigned_to_role || ticket.assignee?.role);

  return {
    ...ticket,
    effective_role: effectiveRole || null,
    can_act_as_delegate: handoverActive ? true : false,
    can_act_as_original_owner: false,
    handover_block_reason: handoverActive
      ? "You handed over this ticket. Revoke handover to continue actions."
      : null,
    handover: handoverActive
      ? {
          active: true,
          handover_id: ticket.handover_id,
          from_user_id: ticket.handover_from_user_id,
          effective_role: effectiveRole || null,
        }
      : { active: false },
  };
};

function canActOnTicketByEffectiveRole(requiredRoles = [], ticket, userId, actorRole) {
  if (!ticket || !userId) return false;
  const policy = getTicketActorPolicy(ticket, userId, actorRole);
  if (!policy.canMutate) return false;
  const role = policy.roleForChecks || getActorRoleForTicket(ticket, userId, actorRole);
  return requiredRoles.map(normalizeRole).includes(role);
}

module.exports = {
  startHandover,
  closeHandover,
  expireDueHandovers,
  listActiveHandoverParticipants,
  listActiveHandoversForUser,
  listActiveHandoversByActor,
  addEffectiveRole,
  canActOnTicketByEffectiveRole,
  isHandoverParticipant,
  getTicketActorPolicy,
  getEffectiveActorRole,
};
