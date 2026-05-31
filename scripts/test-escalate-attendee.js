require("dotenv").config();
const holidays = require("../cron/holidays");
const { Ticket } = require("../models");
const {
  escalateAndUpdateTicketOnSlaBreach,
} = require("../controllers/ticket/ticketController");

const TICKET_ID = "193a9612-94d0-4108-a622-c66f9857f03f";

(async () => {
  const ticket = await Ticket.findByPk(TICKET_ID);
  if (!ticket) {
    console.log("Ticket not found");
    process.exit(1);
  }
  console.log("Before:", {
    ticket_id: ticket.ticket_id,
    section: ticket.section,
    sub_section: ticket.sub_section,
    responsible_unit_name: ticket.responsible_unit_name,
    status: ticket.status,
  });
  const escalated = await escalateAndUpdateTicketOnSlaBreach(ticket, holidays);
  await ticket.reload();
  console.log("Escalated:", escalated);
  console.log("After status:", ticket.status);
  process.exit(0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
