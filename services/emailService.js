const nodemailer = require('nodemailer');

// Create fallback transporter object using SMTP transport
const emailTransporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.wcf.go.tz',
  port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT) : 587,
  secure: false, // STARTTLS for port 587
  auth: {
    user: process.env.MAIL_USERNAME || 'noreply.mac@wcf.go.tz',
    pass: process.env.MAIL_PASSWORD || '@Wcf.2023!!',
  },
  tls: {
    rejectUnauthorized: false, // Accept self-signed certs if any
  },
});

/**
 * Send an email using the configured transporter with fallback
 * @param {Object} param0
 * @param {string} param0.to - Recipient email address
 * @param {string} param0.subject - Email subject
 * @param {string} param0.htmlBody - HTML body of the email
 * @returns {Promise}
 */
const sendEmail = async ({ to, subject, htmlBody }) => {
  const mailOptions = {
    from: 'WCF MAC <noreply.mac@wcf.go.tz>',
    to,
    subject,
    html: htmlBody,
  };

  try {
    // Use only the primary transporter (WCF settings)
    console.log('Attempting to send email using WCF transporter...');
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully with WCF transporter:', info.messageId);
    return info;
  } catch (primaryError) {
    console.error('WCF transporter failed:', primaryError.message);
    throw new Error(`Email sending failed with WCF transporter: ${primaryError.message}`);
  }
};

const sendForwardNotification = async (supervisorEmail, ticketId, unitName, justification) => {
  const subject = `Ticket Forwarded to ${unitName}`;
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ticket Forwarded</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .email-container {
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px 25px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 25px;
        }
        .info-box {
          background-color: #f8f9fa;
          border-left: 4px solid #667eea;
          padding: 20px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .info-item {
          margin: 10px 0;
          display: flex;
          align-items: center;
        }
        .info-label {
          font-weight: 600;
          color: #495057;
          min-width: 120px;
        }
        .info-value {
          color: #212529;
          margin-left: 10px;
        }
        .ticket-id {
          background-color: #e3f2fd;
          color: #1976d2;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 600;
          font-family: 'Courier New', monospace;
        }
        .justification-box {
          background-color: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          padding: 15px;
          margin: 15px 0;
        }
        .justification-label {
          font-weight: 600;
          color: #856404;
          margin-bottom: 8px;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin-top: 20px;
          transition: all 0.3s ease;
        }
        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px 25px;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
        .logo {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <div class="logo">WCF MAC</div>
          <h1>Ticket Forwarded</h1>
          <p>A ticket has been forwarded to your unit for processing</p>
        </div>
        
        <div class="content">
          <div class="info-box">
            <div class="info-item">
              <span class="info-label">Ticket ID:</span>
              <span class="ticket-id">${ticketId}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Forwarded to:</span>
              <span class="info-value">${unitName}</span>
            </div>
          </div>
          
          <div class="justification-box">
            <div class="justification-label">Justification:</div>
            <div>${justification}</div>
          </div>
          
          <p style="margin: 25px 0; color: #6c757d;">
            Please log into the system to view and process this ticket. 
            You can access the ticket management dashboard to take appropriate action.
          </p>
          
          <a href="#" class="cta-button">Access Dashboard</a>
        </div>
        
        <div class="footer">
          <p>This is an automated notification from the WCF MAC Ticket Management System.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: supervisorEmail, subject, htmlBody });
};

const sendRatingNotification = async (userEmail, ticketId, rating, justification) => {
  const subject = `Ticket Rated as ${rating}`;
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ticket Rating Update</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .email-container {
          background-color: #ffffff;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          padding: 30px 25px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
        }
        .content {
          padding: 30px 25px;
        }
        .info-box {
          background-color: #f8f9fa;
          border-left: 4px solid #28a745;
          padding: 20px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .info-item {
          margin: 10px 0;
          display: flex;
          align-items: center;
        }
        .info-label {
          font-weight: 600;
          color: #495057;
          min-width: 120px;
        }
        .info-value {
          color: #212529;
          margin-left: 10px;
        }
        .ticket-id {
          background-color: #e3f2fd;
          color: #1976d2;
          padding: 8px 12px;
          border-radius: 4px;
          font-weight: 600;
          font-family: 'Courier New', monospace;
        }
        .rating-badge {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: 0.5px;
        }
        .rating-minor {
          background-color: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }
        .rating-major {
          background-color: #f8d7da;
          color: #721c24;
          border: 1px solid #f5c6cb;
        }
        .justification-box {
          background-color: #d1ecf1;
          border: 1px solid #bee5eb;
          border-radius: 4px;
          padding: 15px;
          margin: 15px 0;
        }
        .justification-label {
          font-weight: 600;
          color: #0c5460;
          margin-bottom: 8px;
        }
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          margin-top: 20px;
          transition: all 0.3s ease;
        }
        .cta-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
        }
        .footer {
          background-color: #f8f9fa;
          padding: 20px 25px;
          text-align: center;
          color: #6c757d;
          font-size: 14px;
        }
        .logo {
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 10px;
        }
      </style>
    </head>
    <body>
      <div class="email-container">
        <div class="header">
          <div class="logo">WCF MAC</div>
          <h1>Ticket Rating Update</h1>
          <p>Your ticket has been rated by the coordinator</p>
        </div>
        
        <div class="content">
          <div class="info-box">
            <div class="info-item">
              <span class="info-label">Ticket ID:</span>
              <span class="ticket-id">${ticketId}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Rating:</span>
              <span class="rating-badge rating-${rating.toLowerCase()}">${rating}</span>
            </div>
          </div>
          
          <div class="justification-box">
            <div class="justification-label">Coordinator's Justification:</div>
            <div>${justification}</div>
          </div>
          
          <p style="margin: 25px 0; color: #6c757d;">
            Thank you for using our ticket management system. 
            The coordinator has reviewed and rated your ticket based on the provided information.
          </p>
          
          <a href="#" class="cta-button">View Ticket Details</a>
        </div>
        
        <div class="footer">
          <p>This is an automated notification from the WCF MAC Ticket Management System.</p>
          <p>Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return await sendEmail({ to: userEmail, subject, htmlBody });
};

module.exports = {
  sendEmail,
  sendForwardNotification,
  sendRatingNotification
}; 