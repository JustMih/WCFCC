const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
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
 * Send an email using the configured transporter
 * @param {Object} param0
 * @param {string} param0.to - Recipient email address
 * @param {string} param0.subject - Email subject
 * @param {string} param0.htmlBody - HTML body of the email
 * @returns {Promise}
 */
const sendEmail = async ({ to, subject, htmlBody }) => {
  try {
    const info = await transporter.sendMail({
      from: 'WCF MAC <noreply.mac@wcf.go.tz>',
      to,
      subject,
      html: htmlBody,
    });
    console.log('Email sent:', info.messageId);
    return info;
        } catch (error) {
    console.error('Email send error:', error);
        throw error;
    }
};

module.exports = { sendEmail }; 