const nodemailer = require('nodemailer');

// Configure your SMTP transporter
const transporter = nodemailer.createTransport({
  host: '196.192.79.145', // Your SMTP host
  port: 25,               // Port for SMTP (use 587 or 465 if needed)
  secure: false,          // Set to true if using port 465
  tls: { rejectUnauthorized: false },
  logger: true,
  debug: true
});

// Ticket email sender
const sendTicketEmail = async (ticket, recipientEmail) => {
  try {
    const subjectLine = `New Ticket Assigned: ${ticket.subject}`;
    const message = `
      Hello,

      A new ticket has been assigned to you.

      Ticket ID: ${ticket.ticket_id}
      Subject: ${ticket.subject}
      Category: ${ticket.category}
      Description: ${ticket.description}

      Please log into the system to review and take action.

      Regards,
      TTCL Support Desk
    `;

    await transporter.sendMail({
      from: '"TTCL Support Desk" <no-reply@ttcl.go.tz>',
      to: recipientEmail,
      subject: subjectLine,
      text: message
    });

    console.log('📧 Email sent to:', recipientEmail);
  } catch (err) {
    console.error('❌ Failed to send ticket email:', err.message);
    throw err;
  }
};

module.exports = {
  sendTicketEmail
};
