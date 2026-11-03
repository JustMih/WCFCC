/**
 * One-time repair: clear Tickets.handover_* when linked UserHandover is
 * missing or not status=active. Unblocks initiators after incomplete revokes.
 *
 * Usage: node scripts/repair-stale-handover-fields.js
 */
require("dotenv").config();
const { repairStaleHandoverFields } = require("../services/handoverService");
const sequelize = require("../config/mysql_connection");

(async () => {
  try {
    await sequelize.authenticate();
    const result = await repairStaleHandoverFields();
    console.log(
      `Cleared stale handover fields on ${result.cleared} ticket(s).`
    );
    if (result.ticketIds?.length) {
      console.log("Ticket IDs:", result.ticketIds.join(", "));
    }
    process.exit(0);
  } catch (error) {
    console.error("repair-stale-handover-fields failed:", error.message);
    process.exit(1);
  }
})();
