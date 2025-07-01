const cron = require('node-cron');
const { Ticket } = require('../models');
const { Op } = require('sequelize');
const { escalateAndUpdateTicketOnSlaBreach } = require('../controllers/ticket/ticketController');
const holidays = require('./holidays'); // Import holidays

// Run every day at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Running daily SLA escalation check...');
  try {
    const tickets = await Ticket.findAll({
      where: { status: { [Op.in]: ['Open', 'Assigned', 'In Progress'] } }
    });
    console.log(`Found ${tickets.length} tickets to process.`);
    for (const ticket of tickets) {
      const escalated = await escalateAndUpdateTicketOnSlaBreach(ticket, holidays);
      if (escalated) {
        console.log(`Ticket ${ticket.id} escalated (status set to 'Escalated').`);
      } else {
        console.log(`Ticket ${ticket.id} not escalated.`);
      }
    }
    console.log('SLA escalation check complete.');
  } catch (err) {
    console.error('Error in SLA escalation job:', err);
  }
});

// Keep process alive if run standalone
if (require.main === module) {
    (async () => {
        console.log('Running SLA escalation check immediately for testing...');
        try {
          const tickets = await Ticket.findAll({
            where: { status: { [Op.in]: ['Open', 'Assigned', 'In Progress'] } }
          });
          console.log(`Found ${tickets.length} tickets to process.`);
          for (const ticket of tickets) {
            const escalated = await escalateAndUpdateTicketOnSlaBreach(ticket, holidays);
            if (escalated) {
              console.log(`Ticket ${ticket.id} escalated (status set to 'Escalated').`);
            } else {
              console.log(`Ticket ${ticket.id} not escalated.`);
            }
          }
          console.log('SLA escalation check complete.');
        } catch (err) {
          console.error('Error in SLA escalation job:', err);
        }
      })();
  console.log('SLA escalation cron job started.');
} 