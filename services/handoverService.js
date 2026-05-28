const { Op } = require("sequelize");
const sequelize = require("../config/mysql_connection");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const TicketAssignment = require("../models/TicketAssignment");
const UserHandover = require("../models/UserHandover");

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
    User.findByPk(fromUserId, { attributes: ["id", "role", "full_name"] }),
    User.findByPk(toUserId, { attributes: ["id", "role", "full_name"] }),
  ]);
  if (!fromUser || !toUser) {
    throw new Error("from_user_id or to_user_id does not exist");
  }

  const [existingFromActive, circular] = await Promise.all([
    UserHandover.findOne({ where: { from_user_id: fromUserId, status: "active" } }),
    UserHandover.findOne({
      where: { from_user_id: toUserId, to_user_id: fromUserId, status: "active" },
    }),
  ]);

  if (existingFromActive) {
    throw new Error("Source user already has an active handover");
  }
  if (circular) {
    throw new Error("Circular handover detected. Revoke existing reverse handover first.");
  }

  return { fromUser, toUser, parsedReturnDate };
}

async function startHandover({ fromUserId, toUserId, returnAt, reason, actorId, actorRole }) {
  const { fromUser, toUser, parsedReturnDate } = await validateHandoverStart({
    fromUserId,
    toUserId,
    returnAt,
  });

  return sequelize.transaction(async (transaction) => {
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

    return { handover, movedTicketCount: ticketIds.length };
  });
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

function addEffectiveRole(ticketLike) {
  const ticket = ticketLike;
  const handoverActive = Boolean(ticket.handover_id && ticket.handover_effective_role);
  const effectiveRole = handoverActive
    ? normalizeRole(ticket.handover_effective_role)
    : normalizeRole(ticket.assigned_to_role || ticket.assignee?.role);

  return {
    ...ticket,
    effective_role: effectiveRole || null,
    handover: handoverActive
      ? {
          active: true,
          handover_id: ticket.handover_id,
          from_user_id: ticket.handover_from_user_id,
          effective_role: effectiveRole || null,
        }
      : { active: false },
  };
}

function canActOnTicketByEffectiveRole(requiredRoles = [], ticket, userId) {
  if (!ticket || !userId) return false;
  if (ticket.assigned_to_id !== userId) return false;
  const role = normalizeRole(ticket.handover_effective_role || ticket.assigned_to_role);
  return requiredRoles.map(normalizeRole).includes(role);
}

module.exports = {
  startHandover,
  closeHandover,
  expireDueHandovers,
  listActiveHandoversForUser,
  addEffectiveRole,
  canActOnTicketByEffectiveRole,
};
