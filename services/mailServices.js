const nodemailer = require('nodemailer');
const { getContactCenterPortalUrl } = require('./emailService');

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
    const portalUrl = getContactCenterPortalUrl();
    const message = `
      Hello,

      A new ticket has been assigned to you.

      Ticket ID: ${ticket.ticket_id}
      Subject: ${ticket.subject}
      Category: ${ticket.category}
      Description: ${ticket.description}

      Please log into the system to review and take action:
      ${portalUrl}

      Regards,
      TTCL Support Desk
    `;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222;">
        <p>Hello,</p>
        <p>A new ticket has been assigned to you.</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Description:</strong> ${ticket.description}</li>
        </ul>
        <p>
          Please log into the system to review and take action:
          <a href="${portalUrl}" target="_blank" rel="noopener">${portalUrl}</a>
        </p>
        <p>
          <a
            href="${portalUrl}"
            target="_blank"
            rel="noopener"
            style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;"
          >
            Open Call Center System
          </a>
        </p>
        <p>Regards,<br />TTCL Support Desk</p>
      </div>
    `;

    await transporter.sendMail({
      from: '"TTCL Support Desk" <no-reply@ttcl.go.tz>',
      to: recipientEmail,
      subject: subjectLine,
      text: message,
      html,
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
