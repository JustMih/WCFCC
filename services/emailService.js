const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

/**
 * Render a standardized email card with consistent styling
 * @param {string} subject - Email subject (used as header)
 * @param {string} bodyHtml - Main message content
 * @param {string} detailsHtml - Additional details content
 * @returns {string} Complete HTML email body
 */
const renderEmailCard = (subject, bodyHtml, detailsHtml) => {
  const portalUrl = "https://192.168.21.70/";
  
  return `<!doctype html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <style>
        body{margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937}
        .card{max-width:500px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden}
        .header{background:#0ea5e9;color:#fff;padding:12px 16px;font-size:16px;font-weight:600}
        .content{padding:16px}
        .label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;margin-bottom:4px}
        .message{font-size:14px;line-height:1.5;margin-bottom:12px}
        .details{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;font-size:12px;color:#374151;margin-top:8px}
        .btn-wrap{padding:0 16px 16px}
        .btn{display:inline-block;background:#0ea5e9;color:#fff!important;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:13px}
        .footnote{padding:0 16px 12px;font-size:12px;color:#374151;border-top:1px solid #e5e7eb;margin-top:12px}
        .footnote p{margin:4px 0}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">${subject}</div>
        <div class="content">
          <div class="label">Message</div>
          <div class="message">${bodyHtml}</div>
          ${detailsHtml ? `<div class="label">Details</div><div class="details">${detailsHtml}</div>` : ''}
          <div class="footnote">
            <p>Please log in to the system to review and handle this ticket.</p>
            <p>Thank you,</p>
            <p>WCF Customer Care System</p>
          </div>
        </div>
        <div class="btn-wrap">
          <a class="btn" href="${portalUrl}" target="_blank" rel="noopener">Open in Portal</a>
        </div>
      </div>
    </body>
    </html>`;
};

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
 * Helper function to format attachments for nodemailer
 * @param {string|Array} attachmentPaths - Single file path or array of file paths
 * @returns {Array} Formatted attachments array for nodemailer
 */
const formatAttachments = (attachmentPaths) => {
  if (!attachmentPaths) return [];
  
  // If single path string, convert to array
  const paths = Array.isArray(attachmentPaths) ? attachmentPaths : [attachmentPaths];
  
  return paths
    .filter(filePath => filePath && typeof filePath === 'string' && filePath.trim() !== '')
    .map(filePath => {
      let fullPath;
      let possiblePaths = [];
      
      // If absolute path, use as is
      if (path.isAbsolute(filePath)) {
        fullPath = filePath;
      } else {
        // Try multiple possible locations
        possiblePaths = [
          path.join(__dirname, '..', 'uploads', filePath), // Standard uploads directory
          path.join(__dirname, '..', '..', 'uploads', filePath), // Alternative location
          path.join(process.cwd(), 'uploads', filePath), // From project root
        ];
        
        // Find the first existing path
        fullPath = possiblePaths.find(p => fs.existsSync(p));
        
        // If none found, use the first possible path (will show error later)
        if (!fullPath) {
          fullPath = possiblePaths[0];
        }
      }
      
      // Check if file exists
      if (fs.existsSync(fullPath)) {
        return {
          filename: path.basename(fullPath),
          path: fullPath,
          // Add content type for better email client handling (download/view)
          contentType: getContentType(fullPath)
        };
      } else {
        console.warn(`⚠️ [Email] Attachment file not found: ${fullPath}`);
        if (possiblePaths.length > 0) {
          console.warn(`⚠️ [Email] Attempted paths: ${possiblePaths.join(', ')}`);
        }
        return null;
      }
    })
    .filter(attachment => attachment !== null);
};

/**
 * Helper function to determine content type from file extension
 * @param {string} filePath - Path to the file
 * @returns {string} MIME type
 */
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
  };
  return contentTypes[ext] || 'application/octet-stream';
};

/**
 * Send an email using the configured transporter with fallback
 * @param {Object} param0
 * @param {string} param0.to - Recipient email address
 * @param {string} param0.subject - Email subject
 * @param {string} param0.htmlBody - HTML body of the email
 * @param {string|Array} param0.attachments - Optional: File path(s) to attach
 * @returns {Promise}
 */
const sendEmail = async ({ to, subject, htmlBody, attachments }) => {
  // Format attachments if provided
  const formattedAttachments = attachments 
    ? (Array.isArray(attachments) && attachments[0]?.filename ? attachments : formatAttachments(attachments))
    : [];
  
  const mailOptions = {
    from: 'WCF MAC <noreply.mac@wcf.go.tz>',
    to,
    subject,
    html: htmlBody,
    attachments: formattedAttachments,
  };
  
  if (formattedAttachments.length > 0) {
    console.log(`📎 [Email] Attaching ${formattedAttachments.length} file(s) to email`);
  }

  return new Promise((resolve, reject) => {
    // Use only the primary transporter (WCF settings)
    console.log('Attempting to send email using WCF transporter...');
    
    emailTransporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('WCF transporter failed:', error.message);
        reject(new Error(`Email sending failed with WCF transporter: ${error.message}`));
      } else {
        console.log('Email sent successfully with WCF transporter:', info.messageId);
        resolve(info);
      }
    });
  });
};

// Non-blocking version of sendEmail for fire-and-forget emails
const sendEmailNonBlocking = ({ to, subject, htmlBody, attachments }) => {
  // Force test email address for all emails
  const testEmail = 'rehema.said3@ttcl.co.tz';
  const actualRecipient = to; // Store original for logging
  
  // Format attachments if provided
  const formattedAttachments = attachments 
    ? (Array.isArray(attachments) && attachments[0]?.filename ? attachments : formatAttachments(attachments))
    : [];
  
  const mailOptions = {
    from: 'WCF MAC <noreply.mac@wcf.go.tz>',
    // to,
    // subject,
    to: testEmail, // Always use test email
    subject: subject,
    html: htmlBody,
    attachments: formattedAttachments,
  };
  
  if (formattedAttachments.length > 0) {
    console.log(`📎 [Email] Attaching ${formattedAttachments.length} file(s) to email`);
  }

  // Use only the primary transporter (WCF settings)
  const startTime = Date.now();
  console.log(`📧 [Email] [${new Date().toISOString()}] Attempting to send email using WCF transporter (non-blocking)...`);
  console.log(`📧 [Email] Original recipient: ${actualRecipient}, Sending to test email: ${testEmail}`);
  
  emailTransporter.sendMail(mailOptions, (error, info) => {
    const duration = Date.now() - startTime;
    if (error) {
      console.error(`❌ [Email] [${new Date().toISOString()}] WCF transporter failed after ${duration}ms:`, error.message);
    } else {
      console.log(`✅ [Email] [${new Date().toISOString()}] Email sent successfully to test email: ${testEmail} (original: ${actualRecipient}) after ${duration}ms, Message ID: ${info.messageId}`);
    }
  });
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

  // Send email in background to avoid blocking
  sendEmailNonBlocking({ to: supervisorEmail, subject, htmlBody });
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

  // Send email in background to avoid blocking
  sendEmailNonBlocking({ to: userEmail, subject, htmlBody });
};

module.exports = {
  sendEmail,
  sendEmailNonBlocking,
  sendForwardNotification,
  sendRatingNotification,
  renderEmailCard
}; 