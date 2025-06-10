const nodemailer = require('nodemailer');

// Create a transporter object using SMTP transport
const createTransporter = () => nodemailer.createTransport({
    host: '196.192.79.145',
    port: 25,
    secure: false,
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000,    // 5 seconds
    socketTimeout: 10000,     // 10 seconds
    logger: true,
    debug: true,
    pool: true,               // Use pooled connections
    maxConnections: 3,        // Limit number of concurrent connections
    maxMessages: 100         // Limit number of messages per connection
});

// Function to retry sending email
const sendEmailWithRetry = async (mailOptions, maxRetries = 3) => {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const transporter = createTransporter();
            console.log(`Attempt ${attempt} to send email...`);
            
            const result = await new Promise((resolve, reject) => {
                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.error(`❌ Attempt ${attempt} failed:`, error);
                        reject(error);
                    } else {
                        console.log(`✅ Email sent successfully on attempt ${attempt}:`, info.messageId);
                        resolve({ success: true, info });
                    }
                });
            });
            
            return result;
        } catch (error) {
            lastError = error;
            console.error(`Attempt ${attempt} failed with error:`, error.message);
            
            if (attempt < maxRetries) {
                const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
                console.log(`Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw lastError;
};

// HTML Email templates for different ticket categories
const emailTemplates = {
    Complaint: {
        subject: (ticket) => `NEW COMPLAINT TICKET RECEIVED - ${ticket.ticket_id}`,
        body: (ticket) => `
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f4f4f4; padding: 0; margin: 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
                <tr>
                    <td align="center">
                        <table width="600px" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                            <tr>
                                <td align="center" style="background: linear-gradient(90deg, #e74c3c, #c0392b); color: #ffffff; font-size: 16px; font-weight: bold; padding: 20px;">
                                    NEW COMPLAINT TICKET RECEIVED
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 20px; text-align: left; font-size: 14px; color: #333;">
                                    <p>A new complaint ticket has been created with the following details:</p>
                                    
                                    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket ID:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_id}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Subject:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Priority:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.complaint_type || 'N/A'}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Description:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.description}</td>
                                        </tr>
                                    </table>

                                    <p style="margin-top: 20px;"><strong>Customer Details:</strong></p>
                                    <table style="width: 100%; margin: 10px 0; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.first_name} ${ticket.middle_name || ''} ${ticket.last_name}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.phone_number}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Region:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.region}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>District:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.district}</td>
                                        </tr>
                                    </table>

                                    <p style="text-align: center; margin-top: 30px;">
                                        <a href="http://localhost:3000/coordinator/ticket" 
                                           style="display: inline-block; background-color: #e74c3c; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
                                            HANDLE TICKET
                                        </a>
                                    </p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee;">
                                    <p>Email received from <strong>WCF CUSTOMER CARE SYSTEM</strong></p>
                                    <p style="font-size: 10px; color: #888888;">If you are not the intended recipient, please disregard this email.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>`
    },
    Suggestion: {
        subject: (ticket) => `NEW SUGGESTION RECEIVED - ${ticket.ticket_id}`,
        body: (ticket) => `
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f4f4f4; padding: 0; margin: 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f4f4; padding: 20px;">
                <tr>
                    <td align="center">
                        <table width="600px" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
                            <tr>
                                <td align="center" style="background: linear-gradient(90deg, #3498db, #2980b9); color: #ffffff; font-size: 16px; font-weight: bold; padding: 20px;">
                                    NEW SUGGESTION RECEIVED
                                </td>
                            </tr>

                            <!-- Content -->
                            <tr>
                                <td style="padding: 20px; text-align: left; font-size: 14px; color: #333;">
                                    <p>A new suggestion has been submitted with the following details:</p>
                                    
                                    <table style="width: 100%; margin: 20px 0; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Ticket ID:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.ticket_id}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Subject:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.subject}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Description:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.description}</td>
                                        </tr>
                                    </table>

                                    <p style="margin-top: 20px;"><strong>Customer Details:</strong></p>
                                    <table style="width: 100%; margin: 10px 0; border-collapse: collapse;">
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.first_name} ${ticket.middle_name || ''} ${ticket.last_name}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.phone_number}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Region:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.region}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>District:</strong></td>
                                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${ticket.district}</td>
                                        </tr>
                                    </table>

                                    <p style="text-align: center; margin-top: 30px;">
                                        <a href="http://localhost:3000/coordinator/ticket" 
                                           style="display: inline-block; background-color: #3498db; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold;">
                                            REVIEW SUGGESTION
                                        </a>
                                    </p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee;">
                                    <p>Email received from <strong>WCF CUSTOMER CARE SYSTEM</strong></p>
                                    <p style="font-size: 10px; color: #888888;">If you are not the intended recipient, please disregard this email.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>`
    },
    Compliment: {
        subject: 'New Compliment Ticket Created',
        body: (ticket) => `
            A new compliment ticket has been created:
            Ticket ID: ${ticket.ticket_id}
            Subject: ${ticket.subject}
            Category: ${ticket.category}
            Description: ${ticket.description}
            
            Customer Details:
            Name: ${ticket.first_name} ${ticket.middle_name || ''} ${ticket.last_name}
            Phone: ${ticket.phone_number}
            Region: ${ticket.region}
            District: ${ticket.district}
            
            Please login to the system to review this compliment.
        `
    },
    Inquiry: {
        subject: 'New Inquiry Ticket Created',
        body: (ticket) => `
            A new inquiry ticket has been created:
            Ticket ID: ${ticket.ticket_id}
            Subject: ${ticket.subject}
            Category: ${ticket.category}
            Description: ${ticket.description}
            
            Customer Details:
            Name: ${ticket.first_name} ${ticket.middle_name || ''} ${ticket.last_name}
            Phone: ${ticket.phone_number}
            Region: ${ticket.region}
            District: ${ticket.district}
            
            Please login to the system to handle this inquiry.
        `
    }
};

// Function to send email based on ticket category
const sendTicketEmail = async (ticket, recipientEmail) => {
    try {
        const template = emailTemplates[ticket.category];
        if (!template) {
            throw new Error(`No email template found for category: ${ticket.category}`);
        }

        const mailOptions = {
            from: 'wcf-notification@wcf.go.tz',
            to: recipientEmail,
            subject: template.subject(ticket),
            html: template.body(ticket)
        };

        return await sendEmailWithRetry(mailOptions);
    } catch (error) {
        console.error('❌ Failed to send email after all retries:', error.message);
        throw error;
    }
};

module.exports = {
    sendTicketEmail
}; 