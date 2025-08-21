// const { Ticket, User, TicketAssignment } = require("../../models");
// const { Op } = require("sequelize"); // Added Op import

// // External API endpoint for ticket status lookup
// const getTicketStatusExternal = async (req, res) => {
//   try {
//     const { phone_number, ticket_number } = req.body;

//     // Clean up empty strings and whitespace
//     const cleanPhoneNumber = phone_number && phone_number.trim() !== "" ? phone_number.trim() : null;
//     const cleanTicketNumber = ticket_number && ticket_number.trim() !== "" ? ticket_number.trim() : null;

//     // Check if neither parameter is provided
//     if (!cleanPhoneNumber && !cleanTicketNumber) {
//       return res.status(400).json({ 
//         success: false,
//         message: "Please provide a phone number or ticket number",
//         error: "Missing search parameter"
//       });
//     }

//     // Build where clause based on provided parameters
//     let whereClause = {};
//     if (cleanPhoneNumber && cleanTicketNumber) {
//       // If both are provided, use OR condition
//       whereClause = {
//         [Op.or]: [
//           { phone_number: cleanPhoneNumber },
//           { ticket_id: cleanTicketNumber }
//         ]
//       };
//     } else if (cleanPhoneNumber) {
//       whereClause.phone_number = cleanPhoneNumber;
//     } else if (cleanTicketNumber) {
//       whereClause.ticket_id = cleanTicketNumber;
//     }

//     // Find all tickets matching the search criteria
//     const tickets = await Ticket.findAll({
//       where: whereClause,
//       attributes: [
//         'id',
//         'ticket_id',
//         'status',
//         'category',
//         'complaint_type',
//         'subject',
//         'created_at',
//         'updated_at',
//         'phone_number',
//         'region',
//         'responsible_unit_name',
//         'first_name',
//         'last_name',
//         'institution',
//         'assigned_to_role',
//         'assigned_to_id'
//       ],
//       include: [
//         {
//           model: User,
//           as: "assignee",
//           attributes: ["id", "full_name", "role"]
//         }
//       ],
//       order: [["created_at", "DESC"]]
//     });

//     if (tickets.length === 0) {
//       return res.status(404).json({ 
//         success: false,
//         message: "Ticket not found. Check your phone number or ticket number.",
//         error: "Ticket not found",
//         search_criteria: { phone_number: cleanPhoneNumber, ticket_number: cleanTicketNumber }
//       });
//     }

//     // Get current assignee from latest assignment for each ticket
//     const ticketsWithCurrentAssignee = await Promise.all(
//       tickets.map(async (ticket) => {
//         // Get the latest assignment for this ticket
//         const latestAssignment = await TicketAssignment.findOne({
//           where: { ticket_id: ticket.id },
//           order: [["created_at", "DESC"]]
//         });

//         let currentAssignee = null;
//         if (latestAssignment) {
//           // Get the assigned user details
//           const assignedUser = await User.findByPk(latestAssignment.assigned_to_id, {
//             attributes: ["id", "full_name", "role"]
//           });
          
//           if (assignedUser) {
//             currentAssignee = {
//               id: assignedUser.id,
//               name: assignedUser.full_name,
//               role: assignedUser.role
//             };
//           }
//         }

//         return {
//           ...ticket.toJSON(),
//           current_assignee: currentAssignee
//         };
//       })
//     );

//     // Prepare response for external systems
//     const response = {
//       success: true,
//       total_tickets: ticketsWithCurrentAssignee.length,
//       search_criteria: {
//         phone_number: cleanPhoneNumber,
//         ticket_number: cleanTicketNumber
//       },
//       tickets: ticketsWithCurrentAssignee.map(ticket => {
//         // Calculate ticket age
//         const createdAt = new Date(ticket.created_at);
//         const now = new Date();
//         const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

//         return {
//           id: ticket.id,
//           name: ticket.first_name && ticket.last_name ? 
//             `${ticket.first_name} ${ticket.last_name}` : 
//             ticket.institution || 'N/A',
//           ticket_number: ticket.ticket_id,
//           status: ticket.status,
//           category: ticket.category,
//           complaint_type: ticket.complaint_type,
//           subject: ticket.subject,
//           phone_number: ticket.phone_number,
//           region: ticket.region,
//           responsible_unit: ticket.responsible_unit_name,
//           assigned_to_role: ticket.assigned_to_role || null,
//           created_at: ticket.created_at,
//           // updated_at: ticket.updated_at,
//           age_in_days: ageInDays,
//           // current_assignee: ticket.current_assignee,
//           // assignment_status: ticket.assigned_to_id ? "Assigned" : "Not Assigned",
//           // Debug information
//           // assigned_to_id: ticket.assigned_to_id || null,
//           // last_assignment: ticket.assignments && ticket.assignments.length > 0 ? {
//           //   assigned_at: ticket.assignments[0].created_at,
//           //   assigned_to: ticket.assignments[0].assignedTo ? {
//           //     id: ticket.assignments[0].assignedTo.id,
//           //     name: ticket.assignments[0].assignedTo.name,
//           //     role: ticket.assignments[0].assignedTo.role
//           //   } : null
//           // } : null
//         };
//       })
//       // timestamp: new Date().toISOString()
//     };

//     return res.status(200).json(response);

//   } catch (error) {
//     console.error("Error in getTicketStatusExternal:", error);
//     console.error("Error stack:", error.stack);
//     console.error("Request body:", req.body);
//     return res.status(500).json({ 
//       success: false,
//       message: "Server error. Please try again later.",
//       error: "Internal server error"
//     });
//   }
// };

// module.exports = {
//   getTicketStatusExternal
// }; 

const { Ticket, User, TicketAssignment } = require("../../models");
const { Op } = require("sequelize");

// --- helpers (no extra packages) ---
const newReqId = () => Math.random().toString(36).slice(2, 10);
const maskPhone = (p) => (p ? p.toString().trim().replace(/\d(?=\d{3})/g, '*') : null);
const nowIso = () => new Date().toISOString();

const getTicketStatusExternal = async (req, res) => {
  // attach a request id if not present (works with/without middleware)
  const reqId = req.id || newReqId();
  const start = process.hrtime.bigint(); // high-res timer

  try {
    const { phone_number, ticket_number } = req.body || {};
    const cleanPhoneNumber = (phone_number && phone_number.trim()) || null;
    const cleanTicketNumber = (ticket_number && ticket_number.trim()) || null;
    const maskedPhone = maskPhone(cleanPhoneNumber);

    // --- log request hit (masked) ---
    console.info(JSON.stringify({
      ts: nowIso(),
      level: "info",
      reqId,
      event: "ticket_status_external_hit",
      ip: req.ip,
      method: req.method,
      url: req.originalUrl,
      phone_number: maskedPhone,
      ticket_number: cleanTicketNumber || null
    }));

    if (!cleanPhoneNumber && !cleanTicketNumber) {
      console.warn(JSON.stringify({
        ts: nowIso(),
        level: "warn",
        reqId,
        event: "ticket_status_external_missing_params"
      }));
      return res.status(400).json({
        success: false,
        message: "Please provide a phone number or ticket number",
        error: "Missing search parameter"
      });
    }

    // Build where clause (OR if both provided)
    let whereClause = {};
    if (cleanPhoneNumber && cleanTicketNumber) {
      whereClause = { [Op.or]: [{ phone_number: cleanPhoneNumber }, { ticket_id: cleanTicketNumber }] };
    } else if (cleanPhoneNumber) {
      whereClause.phone_number = cleanPhoneNumber;
    } else {
      whereClause.ticket_id = cleanTicketNumber;
    }

    // optional: log the where clause (safe fields only)
    console.info(JSON.stringify({
      ts: nowIso(),
      level: "info",
      reqId,
      event: "ticket_status_external_query",
      where: { ...whereClause, phone_number: maskedPhone } // keep masked in logs
    }));

    const tickets = await Ticket.findAll({
      where: whereClause,
      attributes: [
        'id','ticket_id','status','category','complaint_type','subject',
        'created_at','updated_at','phone_number','region','responsible_unit_name',
        'first_name','last_name','institution','assigned_to_role','assigned_to_id'
      ],
      include: [{
        model: User,
        as: "assignee",
        attributes: ["id", "full_name", "role"]
      }],
      order: [["created_at", "DESC"]]
    });

    if (tickets.length === 0) {
      console.warn(JSON.stringify({
        ts: nowIso(),
        level: "warn",
        reqId,
        event: "ticket_status_external_not_found",
        phone_number: maskedPhone,
        ticket_number: cleanTicketNumber || null
      }));
      return res.status(404).json({
        success: false,
        message: "Ticket not found. Check your phone number or ticket number.",
        error: "Ticket not found",
        search_criteria: { phone_number: cleanPhoneNumber, ticket_number: cleanTicketNumber }
      });
    }

    // N.B. this is N+1; fine for now since we're focusing on logging
    const ticketsWithCurrentAssignee = await Promise.all(
      tickets.map(async (ticket) => {
        const latestAssignment = await TicketAssignment.findOne({
          where: { ticket_id: ticket.id },
          order: [["created_at", "DESC"]]
        });
        let currentAssignee = null;
        if (latestAssignment) {
          const assignedUser = await User.findByPk(latestAssignment.assigned_to_id, {
            attributes: ["id", "full_name", "role"]
          });
          if (assignedUser) {
            currentAssignee = {
              id: assignedUser.id,
              name: assignedUser.full_name,
              role: assignedUser.role
            };
          }
        }
        return { ...ticket.toJSON(), current_assignee: currentAssignee };
      })
    );

    // --- log success summary ---
    const durationMs = Number((process.hrtime.bigint() - start) / 1000000n);
    console.info(JSON.stringify({
      ts: nowIso(),
      level: "info",
      reqId,
      event: "ticket_status_external_success",
      found_count: ticketsWithCurrentAssignee.length,
      duration_ms: durationMs
    }));

    const response = {
      success: true,
      total_tickets: ticketsWithCurrentAssignee.length,
      search_criteria: {
        phone_number: maskedPhone,             // keep masked in response if you expose logs
        ticket_number: cleanTicketNumber
      },
      tickets: ticketsWithCurrentAssignee.map(ticket => {
        const ageInDays = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 86400000);
        return {
          id: ticket.id,
          name: (ticket.first_name && ticket.last_name)
            ? `${ticket.first_name} ${ticket.last_name}`
            : ticket.institution || 'N/A',
          ticket_number: ticket.ticket_id,
          status: ticket.status,
          category: ticket.category,
          complaint_type: ticket.complaint_type,
          subject: ticket.subject,
          phone_number: ticket.phone_number,
          region: ticket.region,
          responsible_unit: ticket.responsible_unit_name,
          assigned_to_role: ticket.assigned_to_role || null,
          created_at: ticket.created_at,
          age_in_days: ageInDays,
          current_assignee: ticket.current_assignee || null,
        };
      })
    };

    return res.status(200).json(response);

  } catch (error) {
    // --- log error with stack and masked input ---
    console.error(JSON.stringify({
      ts: nowIso(),
      level: "error",
      reqId,
      event: "ticket_status_external_error",
      message: error.message,
      stack: error.stack,
      body: {
        // never log raw PII
        phone_number: maskPhone(req.body?.phone_number),
        ticket_number: req.body?.ticket_number || null
      }
    }));
    return res.status(500).json({
      success: false,
      message: "Server error. Please try again later.",
      error: "Internal server error"
    });
  }
};

module.exports = { getTicketStatusExternal };
