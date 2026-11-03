/**
 * Backfill trustworthy workflow metadata for historical rated complaints.
 * Dry run by default. Pass --apply to write only rows whose current stage can
 * be inferred unambiguously from the ticket assignment role/history.
 */
require("dotenv").config();
const { Op } = require("sequelize");
const Ticket = require("../models/Ticket");
const TicketAssignment = require("../models/TicketAssignment");
const sequelize = require("../config/mysql_connection");

const PATHS = {
  MINOR_UNIT: ["agent", "coordinator", "head-of-unit", "attendee", "head-of-unit"],
  MINOR_DIRECTORATE: ["agent", "coordinator", "director", "manager", "attendee", "manager", "director"],
  MAJOR_UNIT: ["agent", "coordinator", "head-of-unit", "attendee", "head-of-unit", "director-general"],
  MAJOR_DIRECTORATE: ["agent", "coordinator", "director", "manager", "attendee", "manager", "director", "director-general"],
};

function roleKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[ _]+/g, "-");
  if (["supervisor", "head-of-unit", "head-unit"].includes(key)) return "head-of-unit";
  if (["dg", "director-general"].includes(key)) return "director-general";
  return key;
}

(async () => {
  const apply = process.argv.includes("--apply");
  try {
    await sequelize.authenticate();
    const candidates = await Ticket.findAll({
      where: {
        workflow_path: null,
        category: "Complaint",
        complaint_type: { [Op.in]: ["Minor", "Major"] },
        responsible_unit_name: { [Op.ne]: null },
      },
      attributes: [
        "id", "ticket_id", "category", "complaint_type", "responsible_unit_name",
        "assigned_to_id", "assigned_to_role", "created_at",
        "workflow_path", "current_workflow_step", "workflow_started_at",
      ],
      raw: true,
    });

    let repaired = 0;
    let skipped = 0;
    for (const ticket of candidates) {
      const isDirectorate = String(ticket.responsible_unit_name).toLowerCase().includes("directorate");
      const path = `${ticket.complaint_type.toUpperCase()}_${isDirectorate ? "DIRECTORATE" : "UNIT"}`;
      const steps = PATHS[path];
      const assignments = await TicketAssignment.findAll({
        where: { ticket_id: ticket.id },
        order: [["created_at", "ASC"]],
        raw: true,
      });
      const workflowEvents = assignments.filter((assignment) =>
        ["assigned", "forwarded", "escalated", "reversed", "closed"].includes(
          String(assignment.action || "").trim().toLowerCase()
        )
      );
      const hasWorkflowEvidence = workflowEvents.some((assignment) =>
        ["forwarded", "escalated"].includes(
          String(assignment.action || "").trim().toLowerCase()
        ) && steps.includes(roleKey(assignment.assigned_to_role))
      );
      if (!hasWorkflowEvidence) {
        skipped += 1;
        console.log(`SKIP ${ticket.ticket_id}: no workflow transition evidence`);
        continue;
      }

      const currentRole = roleKey(ticket.assigned_to_role);
      let stepIndex = -1;
      let ambiguousTransition = false;
      for (const assignment of workflowEvents) {
        const role = roleKey(assignment.assigned_to_role);
        const action = String(assignment.action || "").trim().toLowerCase();
        const matches = steps
          .map((stepRole, index) => stepRole === role ? index : -1)
          .filter((index) => index >= 0);
        if (!matches.length) continue;

        if (action === "reversed") {
          if (matches.includes(stepIndex)) {
            // A reversal may return to a role that is also repeated later in the path.
          } else {
            const earlier = matches.filter((index) => index < stepIndex);
            if (earlier.length) stepIndex = earlier[earlier.length - 1];
            else if (stepIndex < 0) stepIndex = matches[0];
            else ambiguousTransition = true;
          }
        } else if (stepIndex < 0) {
          stepIndex = matches[0];
        } else if (role !== steps[stepIndex]) {
          const next = matches.find((index) => index > stepIndex);
          if (next !== undefined) stepIndex = next;
          else ambiguousTransition = true;
        } else if (action === "forwarded") {
          const next = matches.find((index) => index > stepIndex);
          if (next !== undefined) stepIndex = next;
        }
      }

      if (ambiguousTransition || stepIndex < 0 || steps[stepIndex] !== currentRole) {
        skipped += 1;
        console.log(`SKIP ${ticket.ticket_id}: current stage not in path (role=${currentRole || "missing"})`);
        continue;
      }

      const startEvent = workflowEvents.find((assignment) =>
        ["forwarded", "escalated"].includes(
          String(assignment.action || "").trim().toLowerCase()
        ) && steps.includes(roleKey(assignment.assigned_to_role))
      );
      const startedAt = startEvent?.created_at || ticket.created_at;
      const values = {
        workflow_path: path,
        current_workflow_step: stepIndex + 1,
        current_workflow_role: steps[stepIndex],
        workflow_started_at: startedAt,
      };
      console.log(`${apply ? "UPDATE" : "WOULD UPDATE"} ${ticket.ticket_id}: ${JSON.stringify(values)}`);
      if (apply) {
        await Ticket.update(values, { where: { id: ticket.id, workflow_path: null } });
        repaired += 1;
      }
    }

    console.log(`${apply ? "Applied" : "Dry run"}: ${repaired} updated; ${skipped} skipped; ${candidates.length} candidates.`);
    if (!apply) console.log("To apply the listed safe repairs, rerun with --apply.");
    process.exit(0);
  } catch (error) {
    console.error("Workflow SLA backfill failed:", error.message);
    process.exit(1);
  }
})();
