/**
 * Repair tickets converted to Inquiry that still have category != Inquiry
 * or leftover complaint_type. Sets category/converted_to = Inquiry and clears complaint_type.
 *
 * Usage: node scripts/repair-converted-inquiry-tickets.js
 */
require("dotenv").config();
const { Op } = require("sequelize");
const sequelize = require("../config/mysql_connection");
const Ticket = require("../models/Ticket");

(async () => {
  try {
    await sequelize.authenticate();

    const tickets = await Ticket.findAll({
      where: {
        [Op.or]: [
          { converted_to: "Inquiry" },
          { converted_to: "inquiry" },
        ],
      },
      attributes: ["id", "ticket_id", "category", "converted_to", "complaint_type"],
    });

    let updated = 0;
    for (const ticket of tickets) {
      const category = String(ticket.category || "");
      const needsCategory = category.toLowerCase() !== "inquiry";
      const needsClearType = ticket.complaint_type != null && ticket.complaint_type !== "";
      const needsConvertedTo =
        String(ticket.converted_to || "").toLowerCase() !== "inquiry";

      if (!needsCategory && !needsClearType && !needsConvertedTo) continue;

      await ticket.update({
        category: "Inquiry",
        converted_to: "Inquiry",
        complaint_type: null,
      });
      updated += 1;
      console.log(
        `Repaired ${ticket.ticket_id || ticket.id}: category=${category} -> Inquiry, complaint_type cleared`
      );
    }

    console.log(`Done. Updated ${updated} of ${tickets.length} converted-to-Inquiry ticket(s).`);
    process.exit(0);
  } catch (error) {
    console.error("repair-converted-inquiry-tickets failed:", error.message);
    process.exit(1);
  }
})();
