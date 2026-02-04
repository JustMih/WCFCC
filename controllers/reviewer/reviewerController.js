<<<<<<< HEAD
// const { Ticket, User, Unit } = require('../../models'); // Adjust path if needed

const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const Unit = require("../../models/FunctionData");
const FunctionModel = require("../../models/Function");
const Section = require("../../models/Section");
const { Op, Sequelize } = require("sequelize");
const TicketAssignment = require("../../models/TicketAssignment");
const { sendEmail, renderEmailCard } = require("../../services/emailService");
const Notification = require("../../models/Notification"); // Added Notification model
const { UserRole } = require("../../models");

// Helper to get requester display name
function getRequesterDisplayName(ticket) {
  if (ticket.requester === 'Representative' && ticket.representative_name) {
    return ticket.representative_name;
  }
  const name = [ticket.first_name, ticket.last_name, ticket.middle_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (ticket.institution) return ticket.institution;
  return '-';
}

const getAllReviewerTickets = async (req, res) => {
  let allTickets;
  try {
    // Get tickets assigned to the reviewer with status "Open" or "Assigned"
    allTickets = await Ticket.findAll({
      where: {
        assigned_to_id: req.user.userId,
        category: {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        },
        status: {
          [Op.notIn]: ["Closed", "Forwarded"]
        },
        complaint_type: null
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'username', 'email']
        },
        {
          model: User,
          as: 'ratedBy',
          attributes: ['id', 'full_name', 'email']
        }
      ]
    });

    if (!allTickets.length) {
      return res.status(404).json({
        message: "No tickets assigned to reviewer found."
      });
    }

    // Convert tickets to plain objects to avoid any getter/hook issues during serialization
    // This prevents file access errors from breaking the response
    const ticketsData = allTickets.map(ticket => {
      try {
        return ticket.get({ plain: true });
      } catch (fileError) {
        // If there's a file access error, log it and return basic ticket data
        if (fileError.code === 'ENOENT' && fileError.syscall === 'access') {
          console.warn(`File not found for ticket ${ticket.id}: ${fileError.path}`);
        }
        // Return ticket data using get() which should work even if some getters fail
        return ticket.get({ plain: true });
      }
    });

    res.status(200).json({
      message: "All tickets assigned to reviewer fetched successfully.",
      tickets: ticketsData
    });
  } catch (error) {
    // Handle file access errors specifically - log but don't fail the request
    if (error.code === 'ENOENT' && error.syscall === 'access') {
      console.warn(`File access error in getAllReviewerTickets: ${error.path} - ${error.message}`);
      // If allTickets is defined (error happened during serialization), try to return them
      if (typeof allTickets !== 'undefined') {
        try {
          const ticketsData = allTickets.map(ticket => ticket.get({ plain: true }));
          return res.status(200).json({
            message: "All tickets assigned to reviewer fetched successfully.",
            tickets: ticketsData,
            warning: "Some file references may be unavailable"
          });
        } catch (retryError) {
          console.error("Error retrying ticket serialization:", retryError);
        }
      }
    }

    console.error("Error fetching all reviewer tickets:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};


const rateTickets = async (req, res) => {
  const { userId } = req.body;
  const ticketId = req.params.id;
  const { complaintType } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  if (!["Minor", "Major"].includes(complaintType)) {
    return res
      .status(400)
      .json({ message: "Invalid complaint type. Use 'Minor' or 'Major'." });
  }

  try {
    const ticket = await Ticket.findByPk(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.complaint_type = complaintType;
    ticket.rated_by_id = userId; // ✅ From token
    ticket.rated_at = new Date();

    await ticket.save();

    return res.status(200).json({
      message: `Ticket rated as ${complaintType}`,
      data: ticket
    });
  } catch (error) {
    console.error("Rating Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// const convertOrForwardTicket = async (req, res) => {
//   const { userId } = req.body;
//   const { id: ticketId } = req.params;
//   const { category, responsible_unit_id } = req.body;

//   try {
//     const ticket = await Ticket.findByPk(ticketId);

//     if (!ticket) {
//       return res.status(404).json({ message: "Ticket not found" });
//     }

//     // If converting to another category
//     if (category) {
//       ticket.converted_to = category;
//       ticket.converted_by_id = userId;
//       ticket.converted_at = new Date();
//     }

//     // If forwarding to a unit
//     if (responsible_unit_id) {
//       ticket.responsible_unit_id = responsible_unit_id;
//       ticket.forwarded_by_id = req.user.id;
//       ticket.forwarded_at = new Date();
//     }

//     await ticket.save();

//     res.status(200).json({
//       message: `Ticket ${category ? `converted to ${category}` : ''}${category && responsible_unit_id ? ' and ' : ''}${responsible_unit_id ? `forwarded to unit` : ''}`,
//       data: ticket
//     });
//   } catch (error) {
//     console.error("Convert/Forward Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// UUID validation regex (matches UUID v1-v5)
const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};

// Helper to safely rollback a transaction
async function safeRollback(transaction) {
  if (transaction && !transaction.finished) {
    try {
      await transaction.rollback();
    } catch (e) {
      console.error('Safe rollback failed:', e.message);
    }
  }
}


const convertOrForwardTicket = async (req, res) => {
  const { userId, category, responsible_unit_name, complaintType, ratingComment } = req.body;
  const { id: ticketId } = req.params;

  // Start a transaction
  const transaction = await Ticket.sequelize.transaction();

  try {
    const userId = req.user.userId;

    // Find the ticket and reload to get fresh data (in case it was reversed)
    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: "Ticket not found" });
    }
    
    // Reload ticket to ensure we have the latest data (especially after reverse)
    await ticket.reload({ transaction });

    // Normalize category strings (trim and lowercase) for accurate comparison
    const ticketCategory = String(ticket.category || "").trim().toLowerCase();
    const newCategory = String(category || "").trim().toLowerCase();
    
    const isComplaintTicket = ticketCategory === "complaint";
    const isConvertingToInquiry = newCategory === "inquiry";
    const isForwarding = Boolean(responsible_unit_name);

    // Check if any action parameters are provided
    if (!category && !responsible_unit_name && !complaintType) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Please select a unit to forward to, or choose a category to convert to."
      });
    }

    // Forwarding requires a target unit/section
    if (!responsible_unit_name) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Forwarding is required. Please select a unit to forward the ticket to."
      });
    }

    // Rating rules:
    // - Required ONLY for Complaint tickets when forwarding as a complaint (not converting to Inquiry)
    // - NOT required for: Inquiry, Suggestion, Compliment, or any other non-Complaint category
    // - NOT required when converting any ticket to Inquiry
    // IMPORTANT: Rating is ONLY for Complaint tickets. All other categories (Inquiry/Suggestion/Compliment) do NOT require rating.
    const effectiveComplaintType = complaintType || ticket.complaint_type;
    
    // Only validate rating requirement if this is a Complaint ticket
    // For Inquiry, Suggestion, Compliment, etc. - skip rating validation entirely
    if (isForwarding && isComplaintTicket && !isConvertingToInquiry && !effectiveComplaintType) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Rating is required. Please provide complaintType (Minor or Major)."
      });
    }
    
    // For non-Complaint tickets (Inquiry/Suggestion/Compliment), rating is never required
    // The condition above already handles this by checking isComplaintTicket === true

    // Comment is required when forwarding a complaint (as a complaint)
    if (isForwarding && isComplaintTicket && !isConvertingToInquiry && (!ratingComment || !ratingComment.trim())) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Comment/Description is required when forwarding a complaint. Please provide a comment before forwarding."
      });
    }

    let conversionDone = false;
    let forwardingDone = false;
    let ratingDone = false;
    let assignedRole = null; // Store the role of the user the ticket was assigned to

    // Handle rating (only if provided OR required)
    if (complaintType || (isForwarding && isComplaintTicket && !isConvertingToInquiry && ticket.complaint_type)) {
      const complaintTypeToApply = complaintType || ticket.complaint_type;
      if (!["Minor", "Major"].includes(complaintTypeToApply)) {
        await safeRollback(transaction);
        return res.status(400).json({ 
          message: "Invalid complaint type. Use 'Minor' or 'Major'." 
        });
      }

      ticket.complaint_type = complaintTypeToApply;
      ticket.rated_by_id = userId;
      ticket.rated_at = new Date();
      ratingDone = true;
    }

    // Handle category conversion (can only convert to Inquiry)
    if (category) {
      if (category !== "Inquiry") {
        await safeRollback(transaction);
        return res
          .status(400)
          .json({
            message: "Invalid category: can only convert to 'Inquiry'"
          });
      }

      ticket.converted_to = category;
      ticket.converted_by_id = userId;
      ticket.converted_at = new Date();
      conversionDone = true;

      // When converting to Inquiry, MUST find and assign to focal person
      // Always use responsible_unit_name (the value from forward to input) to find focal person
      // responsible_unit_name is required (validated above), so this will always execute
      if (!responsible_unit_name) {
        await safeRollback(transaction);
        return res.status(400).json({ 
          message: "Unit/Directorate selection is required when converting to Inquiry. Please select a unit to forward the ticket to." 
        });
      }

      // Use responsible_unit_name from frontend directly to find focal person
      // No generic logic - use exact value from frontend
      const searchField = responsible_unit_name;
      
      console.log(`DEBUG: Inquiry conversion - Looking for focal-person using responsible_unit_name from frontend: "${searchField}"`);
      
      // Find focal person using unit_section field with value from frontend
      let focalPerson = null;
      
      if (searchField) {
        // Try exact match first with unit_section
        focalPerson = await User.findOne({
          where: { 
            unit_section: searchField, 
            role: 'focal-person'
          },
          transaction
        });
        
        // If still not found, try case-insensitive match with unit_section
        if (!focalPerson) {
          console.log(`DEBUG: Exact match not found, trying case-insensitive match with unit_section: "${searchField}"`);
          focalPerson = await User.findOne({
            where: {
              [Op.and]: [
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.col('unit_section')),
                  Sequelize.fn('LOWER', searchField)
                ),
                { role: 'focal-person' }
              ]
            },
            transaction
          });
        }
      }

      if (focalPerson) {
        ticket.assigned_to_role = focalPerson.role;
        ticket.assigned_to_id = focalPerson.id;
        ticket.status = "Assigned";
        assignedRole = focalPerson.role; // Store role for success message
        console.log(`✅ Inquiry conversion: Assigned to focal-person: ${focalPerson.full_name} using responsible_unit_name: "${searchField}"`);
        
        // Create notification for the focal person
        if (focalPerson.id !== userId) { // Only create notification if assigned to someone other than reviewer
          await Notification.create({
            ticket_id: ticket.id,
            sender_id: userId,
            recipient_id: focalPerson.id,
            message: `Ticket converted to Inquiry and assigned to you: ${ticket.subject || ticket.ticket_id}`,
            channel: "In-System",
            status: "unread",
            category: "Converted"
          }, { transaction });
        }
      } else {
        // If no focal person found, return error - conversion requires focal person
        await safeRollback(transaction);
        console.error(`ERROR: No focal-person found for unit/directorate "${responsible_unit_name}". Cannot convert to Inquiry.`);
        return res.status(404).json({ 
          message: `No focal-person found for unit/directorate '${responsible_unit_name}'. Please ensure there is a focal-person assigned to this unit/directorate before converting to Inquiry.`
        });
      }
    }

    // Handle forwarding to a unit
    // Declare unitUser at higher scope so it can be accessed by both forwarding and rating blocks
    let unitUser = null;
    
    if (responsible_unit_name) {
      // Check if ticket is already forwarded in this session
      if (forwardingDone) {
        await safeRollback(transaction);
        return res.status(400).json({
          message: "Ticket is already being forwarded in this request. Cannot forward multiple times."
        });
      }

      // Allow forwarding again - removed restriction to allow re-forwarding tickets

      // Validate that ticket is rated before forwarding (Complaint tickets only)
      // If converting to Inquiry in this request, q not required.
      if (isComplaintTicket && !conversionDone && !ticket.complaint_type && !ratingDone) {
        await safeRollback(transaction);
        return res.status(400).json({
          message: "Ticket must be rated (Minor or Major) before it can be forwarded"
        });
      }

      // Determine if it's a directorate or unit based on responsible_unit_name from frontend
      // Check if name contains "directorate" (case-insensitive) - if yes, it's a directorate
      // Check if name contains "units" (case-insensitive) - if yes, it's a unit
      const nameLower = responsible_unit_name.trim().toLowerCase();
      const isDirectorate = nameLower.includes('directorate');
      const isUnit = nameLower.includes('units') || nameLower.includes('unit');
      
      // Check if it's a Section (directorate) or Function (unit) in database
      let section = null;
      let functionUnit = null;
      
      if (isDirectorate) {
        section = await Section.findOne({
          where: { name: responsible_unit_name },
          transaction
        });
      } else if (isUnit) {
        console.log(`DEBUG: Looking for unit with name: "${responsible_unit_name}"`);
        
        // Try to find the unit by name (exact match first)
        functionUnit = await FunctionModel.findOne({
          where: { name: responsible_unit_name },
          transaction
        });
        
        if (functionUnit) {
          console.log(`DEBUG: Found unit in FunctionModel (exact match): ${functionUnit.name} (ID: ${functionUnit.id})`);
        }
        
        // If not found, try case-insensitive search
        if (!functionUnit) {
          console.log(`DEBUG: Exact match not found, trying case-insensitive search...`);
          functionUnit = await FunctionModel.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('name')),
              Sequelize.fn('LOWER', responsible_unit_name)
            ),
            transaction
          });
          
          if (functionUnit) {
            console.log(`DEBUG: Found unit in FunctionModel (case-insensitive): ${functionUnit.name} (ID: ${functionUnit.id})`);
          }
        }
        
        // If still not found, try searching by section name (for cases where frontend sends section name instead of unit name)
        if (!functionUnit) {
          console.log(`DEBUG: Not found in FunctionModel, trying to find by section name: "${responsible_unit_name}"`);
          const section = await Section.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('name')),
              Sequelize.fn('LOWER', responsible_unit_name)
            ),
            include: [{
              model: FunctionModel,
              as: 'functions',
              required: false
            }],
            transaction
          });
          
          if (section) {
            console.log(`DEBUG: Found section: ${section.name} with ${section.functions?.length || 0} functions`);
            // If section found and has functions, use first function
            if (section.functions && section.functions.length > 0) {
              functionUnit = section.functions[0];
              console.log(`DEBUG: Using first function from section: ${functionUnit.name} (ID: ${functionUnit.id})`);
            }
          }
        }
        
        if (!functionUnit) {
          await safeRollback(transaction);
          console.error(`ERROR: Unit '${responsible_unit_name}' not found in FunctionModel or Section`);
          // List available units for debugging
          const allFunctions = await FunctionModel.findAll({
            attributes: ['id', 'name'],
            limit: 10,
            transaction
          });
          console.error(`DEBUG: Available functions (first 10):`, allFunctions.map(f => f.name));
          return res.status(404).json({ message: `Unit '${responsible_unit_name}' not found. Please ensure the unit name is correct.` });
        }
      }

      
      // Only update responsible_unit_name, do not require section/function/unit head
      ticket.responsible_unit_name = responsible_unit_name;
      
      // If converting to Inquiry, skip director/head-of-unit assignment
      // Inquiry tickets are already assigned to focal person in the conversion logic above
      if (conversionDone) {
        console.log("🔍 Forwarding: Ticket is being converted to Inquiry, skipping director/head-of-unit assignment (already assigned to focal-person in conversion logic)");
        // The ticket was already assigned to focal-person in the conversion logic above
        // Just mark as forwarded and continue
        ticket.forwarded_by_id = userId;
        ticket.forwarded_at = new Date();
        ticket.status = "Assigned"; // Keep as "Assigned" since it's an Inquiry
        forwardingDone = true;
        // Skip the rest of forwarding logic - don't create "Forwarded" assignment, conversion logic will handle it
        // Don't set unitUser - it's not needed for Inquiry conversion
        // Exit early - don't proceed with director/head-of-unit forwarding logic
        // The conversion logic below will create the "Converted" assignment
      } else {
        // Not converting to Inquiry - proceed with normal forwarding logic (director/head-of-unit)
        
        // Debug: Log the values to understand what's happening
        console.log(`DEBUG: Forwarding logic - isDirectorate: ${isDirectorate}, isUnit: ${isUnit}, responsible_unit_name: "${responsible_unit_name}"`);
        
        // Determine the appropriate role to assign to based on unit type
        // Check if responsible_unit_name contains "directorate" or "units" to determine target role
        const nameLowerForRole = responsible_unit_name.trim().toLowerCase();
        let targetRole = null;
        
        if (nameLowerForRole.includes('directorate')) {
          targetRole = 'director'; // For directorate, go to Director
          console.log(`DEBUG: "directorate" detected in name - using director role`);
        } else if (nameLowerForRole.includes('units') || nameLowerForRole.includes('unit')) {
          targetRole = 'head-of-unit'; // For unit, go to Head of Unit
          console.log(`DEBUG: "units/unit" detected in name - using head-of-unit role`);
        } else {
          // If neither found, default based on isDirectorate flag
          targetRole = isDirectorate ? 'director' : 'head-of-unit';
          console.log(`DEBUG: No "directorate" or "units" in name - defaulting to ${targetRole} based on isDirectorate: ${isDirectorate}`);
        }

        // Find a user with the target role in the selected unit/directorate
        // Use responsible_unit_name from frontend directly (no generic logic, no fallback)
        if (targetRole) {
        // Use responsible_unit_name from frontend (req.body) directly - no generic logic, no fallback
        const searchField = responsible_unit_name;
        
        console.log(`DEBUG: Looking for ${targetRole} in ${isDirectorate ? 'directorate' : 'unit'}: "${searchField}"`);
        console.log(`DEBUG: Forwarding to responsible_unit_name: "${responsible_unit_name}"`);
        console.log(`DEBUG: Using unit_section field for search with value from frontend`);
        
        // Both directorates and units: search by unit_section
        if (searchField) {
          // Try exact match first with unit_section
          unitUser = await User.findOne({
            where: { 
              unit_section: searchField,
              role: targetRole 
            },
            transaction
          });
          
          // If still not found, try case-insensitive match with unit_section
          if (!unitUser) {
            console.log(`DEBUG: Exact match not found, trying case-insensitive match with unit_section: "${searchField}"`);
            unitUser = await User.findOne({
              where: {
                [Op.and]: [
                  Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('unit_section')),
                    Sequelize.fn('LOWER', searchField)
                  ),
                  { role: targetRole }
                ]
              },
              transaction
            });
          }
        }
        
        // If still not found, list all users with that role to see what values exist
        if (!unitUser) {
          console.log(`DEBUG: No ${targetRole} found for ${isDirectorate ? 'directorate' : 'unit'} "${responsible_unit_name}"`);
          const allUsersWithRole = await User.findAll({
            where: { role: targetRole },
            attributes: ['id', 'full_name', 'unit_section', 'sub_section', 'role'],
            transaction
          });
          console.log(`DEBUG: All users with role ${targetRole}:`, allUsersWithRole.map(u => ({ 
            id: u.id, 
            name: u.full_name, 
            unit_section: u.unit_section,
            sub_section: u.sub_section
          })));
        } else {
          console.log(`DEBUG: Found ${targetRole}: ${unitUser.full_name} (${unitUser.id}) with unit_section: "${unitUser.unit_section}"`);
        }
      }

      // Assign the ticket - only if target role (director or head-of-unit) is found
      if (unitUser) {
        ticket.assigned_to_role = unitUser.role;
        ticket.assigned_to_id = unitUser.id; // Assign to the target role user
        assignedRole = unitUser.role; // Store role for success message
        console.log(`DEBUG: Assigned to ${targetRole}: ${unitUser.full_name} (${unitUser.id})`);
      } else {
        // If target role (director or head-of-unit) not found, return error - no fallback
        await safeRollback(transaction);
        const roleName = targetRole === 'director' ? 'director' : 'head-of-unit';
        // IMPORTANT: Always use responsible_unit_name from frontend (req.body), not ticket.responsible_unit_name
        console.error(`ERROR: No ${roleName} found for ${isDirectorate ? 'directorate' : 'unit'} "${responsible_unit_name}". Cannot forward ticket.`);
        console.error(`ERROR DEBUG: isDirectorate: ${isDirectorate}, isUnit: ${isUnit}, targetRole: "${targetRole}", responsible_unit_name (from frontend): "${responsible_unit_name}"`);
        return res.status(404).json({ 
          message: `No ${roleName} found for ${isDirectorate ? 'directorate' : 'unit'} '${responsible_unit_name}'. Please ensure there is a ${roleName} assigned to this ${isDirectorate ? 'directorate' : 'unit'}.` 
        });
      }

      ticket.forwarded_by_id = userId;
      ticket.forwarded_at = new Date();
      ticket.status = "Forwarded";
      forwardingDone = true;

      // Create TicketAssignment record for forwarding (only forwarding, no conversion)
      // Include rating (complaintType) in the reason since forwarding requires rating
      let forwardReason = `Ticket forwarded to ${responsible_unit_name} by reviewer`;
      
      // Add rating (complaintType) if available
      if (complaintType && complaintType !== 'undefined') {
        forwardReason += `. Rated as ${complaintType}`;
      }
      
      // Add comment if available
      if (ratingComment && ratingComment.trim()) {
        forwardReason += `. Comment: ${ratingComment.trim()}`;
      }
      
      forwardReason += '.';
      
      await TicketAssignment.create({
        ticket_id: ticket.id,
        assigned_by_id: userId,
        assigned_to_id: unitUser.id, // unitUser must exist at this point, otherwise we would have returned an error
        assigned_to_role: unitUser.role,
        action: "Forwarded",
        reason: forwardReason,
        created_at: new Date()
      }, { transaction });

      // Create notification for the assigned user (director or head-of-unit)
      if (unitUser.id !== userId) { // Only create notification if assigned to someone other than reviewer
        await Notification.create({
          ticket_id: ticket.id,
          sender_id: userId,
          recipient_id: unitUser.id,
          message: `Ticket forwarded to you: ${ticket.subject || ticket.ticket_id}`,
          channel: "In-System",
          status: "unread",
          category: "Forwarded"
        }, { transaction });
      }
      }
    }

    // Save the ticket
    await ticket.save({ transaction });

    // IMPORTANT: Rating is NOT a separate action - it's part of forwarding
    // We do NOT create a separate "Rated" assignment record
    // Rating value (complaint_type) is set on the ticket, and rating info is included in "Forwarded" assignment reason
    // No need to create a separate "Rated" assignment even if forwarding was not done

    // Handle conversion - combine with forwarding if both happened
    if (conversionDone) {
      if (forwardingDone) {
        // Both conversion and forwarding happened - combine into one "Converted" entry
        const combinedReason = `Ticket converted to Inquiry and forwarded to ${responsible_unit_name} by reviewer. ` +
                               (ratingComment && ratingComment.trim() ? `Comment: ${ratingComment.trim()}` : '');
        await TicketAssignment.create({
          ticket_id: ticket.id,
          assigned_by_id: userId,
          assigned_to_id: ticket.assigned_to_id, // Use the actual assigned user ID
          assigned_to_role: ticket.assigned_to_role, // Use the actual assigned role
          action: "Converted",
          reason: combinedReason,
          created_at: new Date()
        }, { transaction });
      } else {
        // Only conversion (no forwarding) - create separate "Converted" entry
        await TicketAssignment.create({
          ticket_id: ticket.id,
          assigned_by_id: userId,
          assigned_to_id: ticket.assigned_to_id, // Use the actual assigned user ID
          assigned_to_role: ticket.assigned_to_role, // Use the actual assigned role
          action: "Converted",
          reason: `Ticket converted to Inquiry by reviewer and assigned to ${ticket.assigned_to_role}`,
          created_at: new Date()
        }, { transaction });
      }
    }

    // Commit the transaction
    await transaction.commit();

    // Reload updated ticket
    const updatedTicket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: FunctionModel,
          as: "responsibleUnit",
          attributes: ["name"]
        }
      ]
    });

    // Build dynamic message (include the actual user name the ticket was forwarded/assigned to)
    let assignedToUser = null;
    try {
      if (updatedTicket && updatedTicket.assigned_to_id) {
        assignedToUser = await User.findByPk(updatedTicket.assigned_to_id, {
          attributes: ["id", "full_name", "username", "role"],
        });
      }
    } catch (e) {
      assignedToUser = null;
    }

    const messageParts = [];
    if (ratingDone) messageParts.push(`rated as '${complaintType}'`);
    if (conversionDone) messageParts.push(`converted to Inquiry`);
    if (forwardingDone) {
      // Format role name for display (capitalize and add spaces)
      const formattedRole = assignedRole 
        ? assignedRole.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        : 'user';
      const assignedToLabel = assignedToUser
        ? `${assignedToUser.full_name || assignedToUser.username || assignedToUser.id}`
        : `${formattedRole}`;
      messageParts.push(`forwarded to '${responsible_unit_name}' → ${assignedToLabel} (${formattedRole})`);
    }
    const message = `Ticket successfully ${messageParts.join(" and ")}`;

    return res.status(200).json({
      message,
      data: updatedTicket
    });
  } catch (error) {
    // Rollback transaction on error
    await safeRollback(transaction);
    console.error("Convert/Forward Error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};


const getReviewerDashboardCounts = async (req, res) => {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const baseNewTicketConditions = [
      { responsible_unit_name: null },
      { complaint_type: { [Op.is]: null } },
      { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
      { converted_to: null },
      { created_at: { [Op.gte]: threeDaysAgo } }
    ];

    const complaintsCount = await Ticket.count({
      where: {
        category: "Complaint",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    const suggestionsCount = await Ticket.count({
      where: {
        category: "Suggestion",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    const complementsCount = await Ticket.count({
      where: {
        category: "Compliment",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    // New Tickets: last 10 days
    const newTicketsCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        assigned_to_id: req.user.userId,
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    console.log('New Tickets Count Query Result:', newTicketsCount);
    console.log('Reviewer User ID:', req.user.userId);

    // Escalated Tickets: 
    const escalatedTicketsCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        // [Op.or]: [
        //   { responsible_unit_name: null },
        //   { responsible_unit_name: "Public Relation Unit" }
        // ],
        [Op.and]: [
          { [Op.or]: [{ status: '' }, { status: "Escalated" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    console.log('Escalated Tickets Count Query Result:', escalatedTicketsCount);

    // Channeled Tickets Breakdown
    const directorateCount = await Ticket.count({
      where: {
        responsible_unit_name: { [Op.like]: "%Directorate%" },
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.notIn]: ['Closed', 'Open'] }
      }
    });

    const unitsCount = await Ticket.count({
      where: {
        responsible_unit_name: { [Op.like]: "%Unit%" },
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.notIn]: ['Closed', 'Open'] }
      }
    });

          // Ticket Status Breakdown - Filtered by reviewer and excluding forwarded tickets
    const closedCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: "Closed"
      }
    });

    const minorCount = await Ticket.count({
      where: {
        complaint_type: "Minor",
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }
      }
    });

    const majorCount = await Ticket.count({
      where: {
        complaint_type: "Major",
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }
      }
    });

    // Count open tickets (including Reversed tickets)
    const openCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.in]: ["Open", "Reversed", "Assigned"] },
        assigned_to_id: req.user.userId
      }
    });

    // Count assigned tickets (including Reversed status)
    const assignedCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.in]: ["Assigned", "Reversed"] },
        assigned_to_id: req.user.userId
      }
    });

    const ticketStatus = {
      "Open": openCount,
      // "Assigned": assignedCount,
      Closed: closedCount,
      Minor: minorCount,
      Major: majorCount
      // add other statuses if needed
    };

    // Total should be Open + Closed only (not Minor + Major to avoid duplicates)
    // Minor and Major are ratings that are already counted in Open/Closed tickets
    // const ticketStatusTotal = openCount + closedCount;

    console.log('New Tickets Total Calculation:', newTicketsCount + escalatedTicketsCount);

    res.status(200).json({
      message: "Dashboard counts retrieved successfully",
      ticketStats: {
        newTickets: {
          "Total": newTicketsCount + escalatedTicketsCount, // Fix: Use sum of sub-categories
          "New Tickets": newTicketsCount,
          "Escalated Tickets": escalatedTicketsCount
        },
        convertedTickets: {
          Complaints: complaintsCount,
          Suggestions: suggestionsCount,
          Compliments: complementsCount
        },
        channeledTickets: {
          Directorate: directorateCount,
          Units: unitsCount
        },
        ticketStatus,
        // ticketStatusTotal
      }
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getTicketsByCategoryAndType = async (req, res) => {
  try {
    const { category, type, userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    let whereClause = {};
    let includeClause = [
      {
        model: User,
        as: "creator",
        attributes: ["id", "name", "username", "email"]
      },
      {
        model: User,
        as: "ratedBy",
        attributes: ["id", "name", "email"]
      }
    ];

    // Build where clause based on category and type
    switch (category) {
      case "new":
        whereClause = {
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          assigned_to_id: req.user.userId,
          [Op.and]: [
            { status: { [Op.in]: ["Open", "Reversed"] } },
            { status: { [Op.ne]: "Forwarded" } }
          ]
        };
        break;

      case "converted":
        switch (type) {
          case "inquiries":
            whereClause = { converted_to: "Inquiry" };
            break;
          case "complaints":
            whereClause = { converted_to: "Complaint" };
            break;
          case "suggestions":
            whereClause = { converted_to: "Suggestion" };
            break;
          case "complements":
            whereClause = { converted_to: "Compliment" };
            break;
        }
        break;

      case "channeled":
        switch (type) {
          case "directorate":
            whereClause = { assigned_to_role: "Directorate" };
            break;
          case "units":
            whereClause = { assigned_to_role: "Unit" };
            break;
        }
        break;

      case "status":
        switch (type) {
          case "open":
            whereClause = { status: "Open" };
            break;
          case "progress":
            whereClause = { status: "In Progress" };
            break;
          case "closed":
            whereClause = { status: "Closed" };
            break;
          case "minor":
            whereClause = { complaint_type: "Minor" };
            break;
          case "major":
            whereClause = { complaint_type: "Major" };
            break;
        }
        break;
    }

    // Add search condition if search term is provided
    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { ticket_id: { [Op.like]: `%${search}%` } },
          { name: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // Get total count for pagination
    const totalCount = await Ticket.count({
      where: whereClause,
      include: includeClause
    });

    // Get paginated tickets
    const tickets = await Ticket.findAll({
      where: whereClause,
      include: includeClause,
      order: [["created_at", "DESC"]],
      limit,
      offset
    });

    res.status(200).json({
      message: "Tickets fetched successfully",
      tickets,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// // Helper function to get tickets with common logic
// const getTicketsByStatus = async (userId, status, isOverdue = false) => {
//   const user = await User.findOne({
//     where: { id: userId },
//     attributes: ['id', 'full_name', 'role']
//   });

//   if (!user) {
//     throw new Error('User not found');
//   }

//   let whereClause = {};

//   if (isOverdue) {
//     const threeDaysAgo = new Date();
//     threeDaysAgo.setDate(threeDaysAgo.getDate() - 10);
//     whereClause = {
//       status: 'Open',
//       created_at: { [Op.lt]: threeDaysAgo }
//     };
//   } else {
//     whereClause = { status };
//   }

//   if (user.role !== 'super-admin') {
//     whereClause.assigned_to = userId;
//   }

//   const tickets = await Ticket.findAll({
//     where: whereClause,
//     include: [
//       {
//         model: User,
//         as: 'creator',
//         attributes: ['id', 'full_name', 'phone']
//       }
//     ],
//     order: [['created_at', 'DESC']]
//   });

//   return {
//     tickets,
//     user
//   };
// };

const getOpenTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Open", );

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Open tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching open tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAssignedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Assigned");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No assigned tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching assigned tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getInprogressTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "In Progress");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No in-progress tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "In-progress tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching in-progress tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCarriedForwardTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(
      userId,
      "Carried Forward"
    );

    if (tickets.length === 0) {
      return res
        .status(404)
        .json({ message: "No carried forward tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Carried forward tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching carried forward tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getClosedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Closed");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No closed tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Closed tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching closed tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOverdueTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Escalated", "", true);

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No overdue tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Overdue tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching overdue tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const getTicketsByStatus = async (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = {
      [Op.or]: [
        { category: "Complaint" },
        { category: "Suggestion" },
        { category: "Compliment" }
      ]
    };

    switch (status) {
      case "new":
        // For "new" tickets: show tickets assigned to reviewer that are:
        // - Open, Assigned, Reversed, or null status
        // - Not Forwarded
        // - Can be already rated (complaint_type set) but still need reviewer action
        // Check both assigned_to_id and assigned_to_role to catch all reviewer tickets
        whereClause = {
          [Op.and]: [
            {
              category: {
                [Op.in]: ["Complaint", "Suggestion", "Compliment"]
              }
            },
            {
              [Op.or]: [
                { assigned_to_id: req.user.userId },
                { assigned_to_role: "reviewer" }
              ]
            },
            {
              [Op.or]: [
                { status: null },
                { status: "Open" },
                { status: "Assigned" },
                { status: "Reversed" }
              ]
            },
            {
              status: { [Op.ne]: "Forwarded" }
            }
          ]
        };
        console.log('🔍 Reviewer "new" tickets query:', JSON.stringify(whereClause, null, 2));
        console.log('👤 Reviewer userId:', req.user.userId);
        console.log('👤 Reviewer role:', req.user.role);
        break;
        case "escalated":
          whereClause = {
            category: { [Op.in]: ['Complaint', 'Suggestion', 'Compliment'] },
            [Op.or]: [
              { status: 'Escalated' },
              { status: '' }
            ]
          };
          break;
      case "complaints":
        whereClause.category = { [Op.in]: ["Complaint"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "suggestions":
        whereClause.category = { [Op.in]: ["Suggestion"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "complements":
        whereClause.category = { [Op.in]: ["Compliment"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "directorate":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: { [Op.notIn]: ['Closed', 'Open'] } },
          { responsible_unit_name:  { [Op.like]: "%Directorate%" } }
          // { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
        case "units":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: { [Op.notIn]: ['Closed', 'Open'] } },
          { responsible_unit_name: { [Op.like]: "%Unit%" } }
          // { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "open":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { responsible_unit_name: { [Op.not]: null } },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "on-progress":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: "In Progress" },
          { responsible_unit_name: { [Op.not]: null } }
        ];
        break;
      case "closed":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause.status = "Closed";
        break;
      case "minor":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Minor" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      case "major":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Major" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      case "major-returned":
        whereClause.category = "Complaint";
        whereClause[Op.and] = [
          { complaint_type: "Major" },
          { status: "Returned" }
        ];
        break;
      default:
        whereClause.status = status;
        whereClause[Op.and] = [{ status: { [Op.ne]: "Closed" } }];
        break;
    }

    const tickets = await Ticket.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'username', 'email']
        }
      ],
      order: [["created_at", "DESC"]]
    });

    console.log(`📊 Found ${tickets.length} tickets for status "${status}"`);
    if (status === "new" && tickets.length > 0) {
      console.log('📋 Sample ticket:', {
        id: tickets[0].id,
        ticket_id: tickets[0].ticket_id,
        status: tickets[0].status,
        assigned_to_id: tickets[0].assigned_to_id,
        category: tickets[0].category
      });
    } else if (status === "new" && tickets.length === 0) {
      console.log('⚠️ No tickets found for reviewer. Query:', JSON.stringify(whereClause, null, 2));
    }

    res.json({ tickets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Rate and complete registration of complaints
const rateAndRegisterComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { rating, registrationNotes } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Update ticket with rating and registration details
    await ticket.update({
      complaint_rating: rating,
      registration_notes: registrationNotes,
      registered_by: reviewerId,
      registration_date: new Date(),
      status: "Registered"
    });

    res.status(200).json({
      message: "Complaint rated and registered successfully",
      ticket
    });
  } catch (error) {
    console.error("Error rating and registering complaint:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Convert complaint to inquiry
const convertToInquiry = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { conversionReason } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Update ticket to inquiry
    await ticket.update({
      category: "Inquiry",
      converted_to: "Inquiry",
      conversion_reason: conversionReason,
      converted_by: reviewerId,
      conversion_date: new Date(),
      status: "Open"
    });

    res.status(200).json({
      message: "Complaint converted to inquiry successfully",
      ticket
    });
  } catch (error) {
    console.error("Error converting complaint to inquiry:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Channel complaint to appropriate unit
const channelComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { unitId, channelingNotes } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Get the supervisor of the unit
    const supervisor = await User.findOne({
      where: {
        role: "supervisor",
        unit_id: unitId
      }
    });

    if (!supervisor) {
      return res
        .status(404)
        .json({ message: "No supervisor found for the selected unit" });
    }

    // Update ticket with channeling details
    await ticket.update({
      assigned_to: supervisor.id,
      channeled_to_unit: unitId,
      channeling_notes: channelingNotes,
      channeled_by: reviewerId,
      channeling_date: new Date(),
      status: "Assigned"
    });

    res.status(200).json({
      message: "Complaint channeled successfully",
      ticket
    });
  } catch (error) {
    console.error("Error channeling complaint:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reviewer closes a ticket
const closeReviewerTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution_details, resolution_type } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Handle attachment if uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("Attachment uploaded:", attachmentPath);
    }

    // Update ticket with resolution details and attachment path
    await ticket.update({
      status: 'Closed',
      resolution_details: resolution_details || 'Ticket closed by reviewer',
      resolution_type: resolution_type || 'Resolved',
      attachment_path: attachmentPath, // Save attachment path to ticket
      date_of_resolution: new Date(),
      attended_by_id: reviewerId
    });

    // Record in Ticket_assignments with attachment path
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: reviewerId,
      assigned_to_id: reviewerId,
      assigned_to_role: 'reviewer',
      action: 'Closed',
      reason: resolution_details || 'Ticket closed by reviewer',
      attachment_path: attachmentPath, // Save attachment path to assignment record
      created_at: new Date()
    });

    // Notify the creator (agent) by email if available
    const creator = await User.findOne({ where: { id: ticket.userId } });
    if (creator && creator.email) {
      const emailSubject = `Your Ticket Has Been Closed: ${ticket.subject} (ID: ${ticket.ticket_id})`;
      const bodyHtml = `
        <p>Dear ${creator.name || 'User'},</p>
        <p>Your ticket has been closed by a reviewer. Here are the details:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Description:</strong> ${ticket.description}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Resolution:</strong> ${resolution_details || 'Ticket closed by reviewer'}</li>
        </ul>
        <p>Thank you for using the WCF Customer Care System.</p>
      `;
      const emailBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      sendEmail({
        to:'grace.tarimo@wcf.go.tz',
        subject: emailSubject,
        htmlBody: emailBody
      }).catch(emailError => {
        console.error("Error sending closure email to creator:", emailError.message);
      });
    }

    console.log("Closing ticket details with attachment:", attachmentPath);
    res.status(200).json({
      message: "Ticket closed successfully by reviewer",
      ticket: {
        ...ticket.toJSON(),
        attachment_path: attachmentPath
      }
    });
  } catch (error) {
    console.error("Error closing ticket by reviewer:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllReviewerTickets,
  rateAndRegisterComplaint,
  convertToInquiry,
  channelComplaint,
  rateTickets,
  convertOrForwardTicket,
  getReviewerDashboardCounts,
  getTicketsByCategoryAndType,
  getOpenTickets,
  getAssignedTickets,
  getInprogressTickets,
  getCarriedForwardTickets,
  getClosedTickets,
  getOverdueTickets,
  getTicketsByStatus,
  closeReviewerTicket
};
=======
// const { Ticket, User, Unit } = require('../../models'); // Adjust path if needed

const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const Unit = require("../../models/FunctionData");
const FunctionModel = require("../../models/Function");
const Section = require("../../models/Section");
const { Op, Sequelize } = require("sequelize");
const TicketAssignment = require("../../models/TicketAssignment");
const { sendEmail, renderEmailCard } = require("../../services/emailService");
const Notification = require("../../models/Notification"); // Added Notification model
const { UserRole } = require("../../models");

// Helper to get requester display name
function getRequesterDisplayName(ticket) {
  if (ticket.requester === 'Representative' && ticket.representative_name) {
    return ticket.representative_name;
  }
  const name = [ticket.first_name, ticket.last_name, ticket.middle_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (ticket.institution) return ticket.institution;
  return '-';
}

const getAllReviewerTickets = async (req, res) => {
  let allTickets;
  try {
    // Get tickets assigned to the reviewer with status "Open" or "Assigned"
    allTickets = await Ticket.findAll({
      where: {
        assigned_to_id: req.user.userId,
        category: {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        },
        status: {
          [Op.notIn]: ["Closed", "Forwarded"]
        },
        complaint_type: null
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'username', 'email']
        },
        {
          model: User,
          as: 'ratedBy',
          attributes: ['id', 'full_name', 'email']
        }
      ]
    });

    if (!allTickets.length) {
      return res.status(404).json({
        message: "No tickets assigned to reviewer found."
      });
    }

    // Convert tickets to plain objects to avoid any getter/hook issues during serialization
    // This prevents file access errors from breaking the response
    const ticketsData = allTickets.map(ticket => {
      try {
        return ticket.get({ plain: true });
      } catch (fileError) {
        // If there's a file access error, log it and return basic ticket data
        if (fileError.code === 'ENOENT' && fileError.syscall === 'access') {
          console.warn(`File not found for ticket ${ticket.id}: ${fileError.path}`);
        }
        // Return ticket data using get() which should work even if some getters fail
        return ticket.get({ plain: true });
      }
    });

    res.status(200).json({
      message: "All tickets assigned to reviewer fetched successfully.",
      tickets: ticketsData
    });
  } catch (error) {
    // Handle file access errors specifically - log but don't fail the request
    if (error.code === 'ENOENT' && error.syscall === 'access') {
      console.warn(`File access error in getAllReviewerTickets: ${error.path} - ${error.message}`);
      // If allTickets is defined (error happened during serialization), try to return them
      if (typeof allTickets !== 'undefined') {
        try {
          const ticketsData = allTickets.map(ticket => ticket.get({ plain: true }));
          return res.status(200).json({
            message: "All tickets assigned to reviewer fetched successfully.",
            tickets: ticketsData,
            warning: "Some file references may be unavailable"
          });
        } catch (retryError) {
          console.error("Error retrying ticket serialization:", retryError);
        }
      }
    }

    console.error("Error fetching all reviewer tickets:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};


const rateTickets = async (req, res) => {
  const { userId } = req.body;
  const ticketId = req.params.id;
  const { complaintType } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  if (!["Minor", "Major"].includes(complaintType)) {
    return res
      .status(400)
      .json({ message: "Invalid complaint type. Use 'Minor' or 'Major'." });
  }

  try {
    const ticket = await Ticket.findByPk(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.complaint_type = complaintType;
    ticket.rated_by_id = userId; // ✅ From token
    ticket.rated_at = new Date();

    await ticket.save();

    return res.status(200).json({
      message: `Ticket rated as ${complaintType}`,
      data: ticket
    });
  } catch (error) {
    console.error("Rating Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// const convertOrForwardTicket = async (req, res) => {
//   const { userId } = req.body;
//   const { id: ticketId } = req.params;
//   const { category, responsible_unit_id } = req.body;

//   try {
//     const ticket = await Ticket.findByPk(ticketId);

//     if (!ticket) {
//       return res.status(404).json({ message: "Ticket not found" });
//     }

//     // If converting to another category
//     if (category) {
//       ticket.converted_to = category;
//       ticket.converted_by_id = userId;
//       ticket.converted_at = new Date();
//     }

//     // If forwarding to a unit
//     if (responsible_unit_id) {
//       ticket.responsible_unit_id = responsible_unit_id;
//       ticket.forwarded_by_id = req.user.id;
//       ticket.forwarded_at = new Date();
//     }

//     await ticket.save();

//     res.status(200).json({
//       message: `Ticket ${category ? `converted to ${category}` : ''}${category && responsible_unit_id ? ' and ' : ''}${responsible_unit_id ? `forwarded to unit` : ''}`,
//       data: ticket
//     });
//   } catch (error) {
//     console.error("Convert/Forward Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// UUID validation regex (matches UUID v1-v5)
const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};

// Helper to safely rollback a transaction
async function safeRollback(transaction) {
  if (transaction && !transaction.finished) {
    try {
      await transaction.rollback();
    } catch (e) {
      console.error('Safe rollback failed:', e.message);
    }
  }
}


const convertOrForwardTicket = async (req, res) => {
  const { userId, category, responsible_unit_name, complaintType, ratingComment } = req.body;
  const { id: ticketId } = req.params;

  // Start a transaction
  const transaction = await Ticket.sequelize.transaction();

  try {
    const userId = req.user.userId;

    // Find the ticket and reload to get fresh data (in case it was reversed)
    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: "Ticket not found" });
    }
    
    // Reload ticket to ensure we have the latest data (especially after reverse)
    await ticket.reload({ transaction });

    // Normalize category strings (trim and lowercase) for accurate comparison
    const ticketCategory = String(ticket.category || "").trim().toLowerCase();
    const newCategory = String(category || "").trim().toLowerCase();
    
    const isComplaintTicket = ticketCategory === "complaint";
    const isConvertingToInquiry = newCategory === "inquiry";
    const isForwarding = Boolean(responsible_unit_name);

    // Check if any action parameters are provided
    if (!category && !responsible_unit_name && !complaintType) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Please select a unit to forward to, or choose a category to convert to."
      });
    }

    // Forwarding requires a target unit/section
    if (!responsible_unit_name) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Forwarding is required. Please select a unit to forward the ticket to."
      });
    }

    // Rating rules:
    // - Required ONLY for Complaint tickets when forwarding as a complaint (not converting to Inquiry)
    // - NOT required for: Inquiry, Suggestion, Compliment, or any other non-Complaint category
    // - NOT required when converting any ticket to Inquiry
    // IMPORTANT: Rating is ONLY for Complaint tickets. All other categories (Inquiry/Suggestion/Compliment) do NOT require rating.
    const effectiveComplaintType = complaintType || ticket.complaint_type;
    
    // Only validate rating requirement if this is a Complaint ticket
    // For Inquiry, Suggestion, Compliment, etc. - skip rating validation entirely
    if (isForwarding && isComplaintTicket && !isConvertingToInquiry && !effectiveComplaintType) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Rating is required. Please provide complaintType (Minor or Major)."
      });
    }
    
    // For non-Complaint tickets (Inquiry/Suggestion/Compliment), rating is never required
    // The condition above already handles this by checking isComplaintTicket === true

    // Comment is required when forwarding a complaint (as a complaint)
    if (isForwarding && isComplaintTicket && !isConvertingToInquiry && (!ratingComment || !ratingComment.trim())) {
      await safeRollback(transaction);
      return res.status(400).json({
        message: "Comment/Description is required when forwarding a complaint. Please provide a comment before forwarding."
      });
    }

    let conversionDone = false;
    let forwardingDone = false;
    let ratingDone = false;
    let assignedRole = null; // Store the role of the user the ticket was assigned to

    // Handle rating (only if provided OR required)
    if (complaintType || (isForwarding && isComplaintTicket && !isConvertingToInquiry && ticket.complaint_type)) {
      const complaintTypeToApply = complaintType || ticket.complaint_type;
      if (!["Minor", "Major"].includes(complaintTypeToApply)) {
        await safeRollback(transaction);
        return res.status(400).json({ 
          message: "Invalid complaint type. Use 'Minor' or 'Major'." 
        });
      }

      ticket.complaint_type = complaintTypeToApply;
      ticket.rated_by_id = userId;
      ticket.rated_at = new Date();
      ratingDone = true;
    }

    // Handle category conversion (can only convert to Inquiry)
    if (category) {
      if (category !== "Inquiry") {
        await safeRollback(transaction);
        return res
          .status(400)
          .json({
            message: "Invalid category: can only convert to 'Inquiry'"
          });
      }

      ticket.converted_to = category;
      ticket.converted_by_id = userId;
      ticket.converted_at = new Date();
      conversionDone = true;

      // When converting to Inquiry, MUST find and assign to focal person
      // Always use responsible_unit_name (the value from forward to input) to find focal person
      // responsible_unit_name is required (validated above), so this will always execute
      if (!responsible_unit_name) {
        await safeRollback(transaction);
        return res.status(400).json({ 
          message: "Unit/Directorate selection is required when converting to Inquiry. Please select a unit to forward the ticket to." 
        });
      }

      // Use responsible_unit_name from frontend directly to find focal person
      // No generic logic - use exact value from frontend
      const searchField = responsible_unit_name;
      
      console.log(`DEBUG: Inquiry conversion - Looking for focal-person using responsible_unit_name from frontend: "${searchField}"`);
      
      // Find focal person using unit_section field with value from frontend
      let focalPerson = null;
      
      if (searchField) {
        // Try exact match first with unit_section
        focalPerson = await User.findOne({
          where: { 
            unit_section: searchField, 
            role: 'focal-person'
          },
          transaction
        });
        
        // If still not found, try case-insensitive match with unit_section
        if (!focalPerson) {
          console.log(`DEBUG: Exact match not found, trying case-insensitive match with unit_section: "${searchField}"`);
          focalPerson = await User.findOne({
            where: {
              [Op.and]: [
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.col('unit_section')),
                  Sequelize.fn('LOWER', searchField)
                ),
                { role: 'focal-person' }
              ]
            },
            transaction
          });
        }
      }

      if (focalPerson) {
        ticket.assigned_to_role = focalPerson.role;
        ticket.assigned_to_id = focalPerson.id;
        ticket.status = "Assigned";
        assignedRole = focalPerson.role; // Store role for success message
        console.log(`✅ Inquiry conversion: Assigned to focal-person: ${focalPerson.full_name} using responsible_unit_name: "${searchField}"`);
        
        // Create notification for the focal person
        if (focalPerson.id !== userId) { // Only create notification if assigned to someone other than reviewer
          await Notification.create({
            ticket_id: ticket.id,
            sender_id: userId,
            recipient_id: focalPerson.id,
            message: `Ticket converted to Inquiry and assigned to you: ${ticket.subject || ticket.ticket_id}`,
            channel: "In-System",
            status: "unread",
            category: "Converted"
          }, { transaction });
        }
      } else {
        // If no focal person found, return error - conversion requires focal person
        await safeRollback(transaction);
        console.error(`ERROR: No focal-person found for unit/directorate "${responsible_unit_name}". Cannot convert to Inquiry.`);
        return res.status(404).json({ 
          message: `No focal-person found for unit/directorate '${responsible_unit_name}'. Please ensure there is a focal-person assigned to this unit/directorate before converting to Inquiry.`
        });
      }
    }

    // Handle forwarding to a unit
    // Declare unitUser at higher scope so it can be accessed by both forwarding and rating blocks
    let unitUser = null;
    
    if (responsible_unit_name) {
      // Check if ticket is already forwarded in this session
      if (forwardingDone) {
        await safeRollback(transaction);
        return res.status(400).json({
          message: "Ticket is already being forwarded in this request. Cannot forward multiple times."
        });
      }

      // Allow forwarding again - removed restriction to allow re-forwarding tickets

      // Validate that ticket is rated before forwarding (Complaint tickets only)
      // If converting to Inquiry in this request, q not required.
      if (isComplaintTicket && !conversionDone && !ticket.complaint_type && !ratingDone) {
        await safeRollback(transaction);
        return res.status(400).json({
          message: "Ticket must be rated (Minor or Major) before it can be forwarded"
        });
      }

      // Determine if it's a directorate or unit based on responsible_unit_name from frontend
      // Check if name contains "directorate" (case-insensitive) - if yes, it's a directorate
      // Check if name contains "units" (case-insensitive) - if yes, it's a unit
      const nameLower = responsible_unit_name.trim().toLowerCase();
      const isDirectorate = nameLower.includes('directorate');
      const isUnit = nameLower.includes('units') || nameLower.includes('unit');
      
      // Check if it's a Section (directorate) or Function (unit) in database
      let section = null;
      let functionUnit = null;
      
      if (isDirectorate) {
        section = await Section.findOne({
          where: { name: responsible_unit_name },
          transaction
        });
      } else if (isUnit) {
        console.log(`DEBUG: Looking for unit with name: "${responsible_unit_name}"`);
        
        // Try to find the unit by name (exact match first)
        functionUnit = await FunctionModel.findOne({
          where: { name: responsible_unit_name },
          transaction
        });
        
        if (functionUnit) {
          console.log(`DEBUG: Found unit in FunctionModel (exact match): ${functionUnit.name} (ID: ${functionUnit.id})`);
        }
        
        // If not found, try case-insensitive search
        if (!functionUnit) {
          console.log(`DEBUG: Exact match not found, trying case-insensitive search...`);
          functionUnit = await FunctionModel.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('name')),
              Sequelize.fn('LOWER', responsible_unit_name)
            ),
            transaction
          });
          
          if (functionUnit) {
            console.log(`DEBUG: Found unit in FunctionModel (case-insensitive): ${functionUnit.name} (ID: ${functionUnit.id})`);
          }
        }
        
        // If still not found, try searching by section name (for cases where frontend sends section name instead of unit name)
        if (!functionUnit) {
          console.log(`DEBUG: Not found in FunctionModel, trying to find by section name: "${responsible_unit_name}"`);
          const section = await Section.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('name')),
              Sequelize.fn('LOWER', responsible_unit_name)
            ),
            include: [{
              model: FunctionModel,
              as: 'functions',
              required: false
            }],
            transaction
          });
          
          if (section) {
            console.log(`DEBUG: Found section: ${section.name} with ${section.functions?.length || 0} functions`);
            // If section found and has functions, use first function
            if (section.functions && section.functions.length > 0) {
              functionUnit = section.functions[0];
              console.log(`DEBUG: Using first function from section: ${functionUnit.name} (ID: ${functionUnit.id})`);
            }
          }
        }
        
        if (!functionUnit) {
          await safeRollback(transaction);
          console.error(`ERROR: Unit '${responsible_unit_name}' not found in FunctionModel or Section`);
          // List available units for debugging
          const allFunctions = await FunctionModel.findAll({
            attributes: ['id', 'name'],
            limit: 10,
            transaction
          });
          console.error(`DEBUG: Available functions (first 10):`, allFunctions.map(f => f.name));
          return res.status(404).json({ message: `Unit '${responsible_unit_name}' not found. Please ensure the unit name is correct.` });
        }
      }

      
      // Only update responsible_unit_name, do not require section/function/unit head
      ticket.responsible_unit_name = responsible_unit_name;
      
      // If converting to Inquiry, skip director/head-of-unit assignment
      // Inquiry tickets are already assigned to focal person in the conversion logic above
      if (conversionDone) {
        console.log("🔍 Forwarding: Ticket is being converted to Inquiry, skipping director/head-of-unit assignment (already assigned to focal-person in conversion logic)");
        // The ticket was already assigned to focal-person in the conversion logic above
        // Just mark as forwarded and continue
        ticket.forwarded_by_id = userId;
        ticket.forwarded_at = new Date();
        ticket.status = "Assigned"; // Keep as "Assigned" since it's an Inquiry
        forwardingDone = true;
        // Skip the rest of forwarding logic - don't create "Forwarded" assignment, conversion logic will handle it
        // Don't set unitUser - it's not needed for Inquiry conversion
        // Exit early - don't proceed with director/head-of-unit forwarding logic
        // The conversion logic below will create the "Converted" assignment
      } else {
        // Not converting to Inquiry - proceed with normal forwarding logic (director/head-of-unit)
        
        // Debug: Log the values to understand what's happening
        console.log(`DEBUG: Forwarding logic - isDirectorate: ${isDirectorate}, isUnit: ${isUnit}, responsible_unit_name: "${responsible_unit_name}"`);
        
        // Determine the appropriate role to assign to based on unit type
        // Check if responsible_unit_name contains "directorate" or "units" to determine target role
        const nameLowerForRole = responsible_unit_name.trim().toLowerCase();
        let targetRole = null;
        
        if (nameLowerForRole.includes('directorate')) {
          targetRole = 'director'; // For directorate, go to Director
          console.log(`DEBUG: "directorate" detected in name - using director role`);
        } else if (nameLowerForRole.includes('units') || nameLowerForRole.includes('unit')) {
          targetRole = 'head-of-unit'; // For unit, go to Head of Unit
          console.log(`DEBUG: "units/unit" detected in name - using head-of-unit role`);
        } else {
          // If neither found, default based on isDirectorate flag
          targetRole = isDirectorate ? 'director' : 'head-of-unit';
          console.log(`DEBUG: No "directorate" or "units" in name - defaulting to ${targetRole} based on isDirectorate: ${isDirectorate}`);
        }

        // Find a user with the target role in the selected unit/directorate
        // Use responsible_unit_name from frontend directly (no generic logic, no fallback)
        if (targetRole) {
        // Use responsible_unit_name from frontend (req.body) directly - no generic logic, no fallback
        const searchField = responsible_unit_name;
        
        console.log(`DEBUG: Looking for ${targetRole} in ${isDirectorate ? 'directorate' : 'unit'}: "${searchField}"`);
        console.log(`DEBUG: Forwarding to responsible_unit_name: "${responsible_unit_name}"`);
        console.log(`DEBUG: Using unit_section field for search with value from frontend`);
        
        // Both directorates and units: search by unit_section
        if (searchField) {
          // Try exact match first with unit_section
          unitUser = await User.findOne({
            where: { 
              unit_section: searchField,
              role: targetRole 
            },
            transaction
          });
          
          // If still not found, try case-insensitive match with unit_section
          if (!unitUser) {
            console.log(`DEBUG: Exact match not found, trying case-insensitive match with unit_section: "${searchField}"`);
            unitUser = await User.findOne({
              where: {
                [Op.and]: [
                  Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('unit_section')),
                    Sequelize.fn('LOWER', searchField)
                  ),
                  { role: targetRole }
                ]
              },
              transaction
            });
          }
        }
        
        // If still not found, list all users with that role to see what values exist
        if (!unitUser) {
          console.log(`DEBUG: No ${targetRole} found for ${isDirectorate ? 'directorate' : 'unit'} "${responsible_unit_name}"`);
          const allUsersWithRole = await User.findAll({
            where: { role: targetRole },
            attributes: ['id', 'full_name', 'unit_section', 'sub_section', 'role'],
            transaction
          });
          console.log(`DEBUG: All users with role ${targetRole}:`, allUsersWithRole.map(u => ({ 
            id: u.id, 
            name: u.full_name, 
            unit_section: u.unit_section,
            sub_section: u.sub_section
          })));
        } else {
          console.log(`DEBUG: Found ${targetRole}: ${unitUser.full_name} (${unitUser.id}) with unit_section: "${unitUser.unit_section}"`);
        }
      }

      // Assign the ticket - only if target role (director or head-of-unit) is found
      if (unitUser) {
        ticket.assigned_to_role = unitUser.role;
        ticket.assigned_to_id = unitUser.id; // Assign to the target role user
        assignedRole = unitUser.role; // Store role for success message
        console.log(`DEBUG: Assigned to ${targetRole}: ${unitUser.full_name} (${unitUser.id})`);
      } else {
        // If target role (director or head-of-unit) not found, return error - no fallback
        await safeRollback(transaction);
        const roleName = targetRole === 'director' ? 'director' : 'head-of-unit';
        // IMPORTANT: Always use responsible_unit_name from frontend (req.body), not ticket.responsible_unit_name
        console.error(`ERROR: No ${roleName} found for ${isDirectorate ? 'directorate' : 'unit'} "${responsible_unit_name}". Cannot forward ticket.`);
        console.error(`ERROR DEBUG: isDirectorate: ${isDirectorate}, isUnit: ${isUnit}, targetRole: "${targetRole}", responsible_unit_name (from frontend): "${responsible_unit_name}"`);
        return res.status(404).json({ 
          message: `No ${roleName} found for ${isDirectorate ? 'directorate' : 'unit'} '${responsible_unit_name}'. Please ensure there is a ${roleName} assigned to this ${isDirectorate ? 'directorate' : 'unit'}.` 
        });
      }

      ticket.forwarded_by_id = userId;
      ticket.forwarded_at = new Date();
      ticket.status = "Forwarded";
      forwardingDone = true;

      // Create TicketAssignment record for forwarding (only forwarding, no conversion)
      // Include rating (complaintType) in the reason since forwarding requires rating
      let forwardReason = `Ticket forwarded to ${responsible_unit_name} by reviewer`;
      
      // Add rating (complaintType) if available
      if (complaintType && complaintType !== 'undefined') {
        forwardReason += `. Rated as ${complaintType}`;
      }
      
      // Add comment if available
      if (ratingComment && ratingComment.trim()) {
        forwardReason += `. Comment: ${ratingComment.trim()}`;
      }
      
      forwardReason += '.';
      
      await TicketAssignment.create({
        ticket_id: ticket.id,
        assigned_by_id: userId,
        assigned_to_id: unitUser.id, // unitUser must exist at this point, otherwise we would have returned an error
        assigned_to_role: unitUser.role,
        action: "Forwarded",
        reason: forwardReason,
        created_at: new Date()
      }, { transaction });

      // Create notification for the assigned user (director or head-of-unit)
      if (unitUser.id !== userId) { // Only create notification if assigned to someone other than reviewer
        await Notification.create({
          ticket_id: ticket.id,
          sender_id: userId,
          recipient_id: unitUser.id,
          message: `Ticket forwarded to you: ${ticket.subject || ticket.ticket_id}`,
          channel: "In-System",
          status: "unread",
          category: "Forwarded"
        }, { transaction });
      }
      }
    }

    // Save the ticket
    await ticket.save({ transaction });

    // IMPORTANT: Rating is NOT a separate action - it's part of forwarding
    // We do NOT create a separate "Rated" assignment record
    // Rating value (complaint_type) is set on the ticket, and rating info is included in "Forwarded" assignment reason
    // No need to create a separate "Rated" assignment even if forwarding was not done

    // Handle conversion - combine with forwarding if both happened
    if (conversionDone) {
      if (forwardingDone) {
        // Both conversion and forwarding happened - combine into one "Converted" entry
        const combinedReason = `Ticket converted to Inquiry and forwarded to ${responsible_unit_name} by reviewer. ` +
                               (ratingComment && ratingComment.trim() ? `Comment: ${ratingComment.trim()}` : '');
        await TicketAssignment.create({
          ticket_id: ticket.id,
          assigned_by_id: userId,
          assigned_to_id: ticket.assigned_to_id, // Use the actual assigned user ID
          assigned_to_role: ticket.assigned_to_role, // Use the actual assigned role
          action: "Converted",
          reason: combinedReason,
          created_at: new Date()
        }, { transaction });
      } else {
        // Only conversion (no forwarding) - create separate "Converted" entry
        await TicketAssignment.create({
          ticket_id: ticket.id,
          assigned_by_id: userId,
          assigned_to_id: ticket.assigned_to_id, // Use the actual assigned user ID
          assigned_to_role: ticket.assigned_to_role, // Use the actual assigned role
          action: "Converted",
          reason: `Ticket converted to Inquiry by reviewer and assigned to ${ticket.assigned_to_role}`,
          created_at: new Date()
        }, { transaction });
      }
    }

    // Commit the transaction
    await transaction.commit();

    // Reload updated ticket
    const updatedTicket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: FunctionModel,
          as: "responsibleUnit",
          attributes: ["name"]
        }
      ]
    });

    // Build dynamic message (include the actual user name the ticket was forwarded/assigned to)
    let assignedToUser = null;
    try {
      if (updatedTicket && updatedTicket.assigned_to_id) {
        assignedToUser = await User.findByPk(updatedTicket.assigned_to_id, {
          attributes: ["id", "full_name", "username", "role"],
        });
      }
    } catch (e) {
      assignedToUser = null;
    }

    const messageParts = [];
    if (ratingDone) messageParts.push(`rated as '${complaintType}'`);
    if (conversionDone) messageParts.push(`converted to Inquiry`);
    if (forwardingDone) {
      // Format role name for display (capitalize and add spaces)
      const formattedRole = assignedRole 
        ? assignedRole.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        : 'user';
      const assignedToLabel = assignedToUser
        ? `${assignedToUser.full_name || assignedToUser.username || assignedToUser.id}`
        : `${formattedRole}`;
      messageParts.push(`forwarded to '${responsible_unit_name}' → ${assignedToLabel} (${formattedRole})`);
    }
    const message = `Ticket successfully ${messageParts.join(" and ")}`;

    return res.status(200).json({
      message,
      data: updatedTicket
    });
  } catch (error) {
    // Rollback transaction on error
    await safeRollback(transaction);
    console.error("Convert/Forward Error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};


const getReviewerDashboardCounts = async (req, res) => {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const baseNewTicketConditions = [
      { responsible_unit_name: null },
      { complaint_type: { [Op.is]: null } },
      { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
      { converted_to: null },
      { created_at: { [Op.gte]: threeDaysAgo } }
    ];

    const complaintsCount = await Ticket.count({
      where: {
        category: "Complaint",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    const suggestionsCount = await Ticket.count({
      where: {
        category: "Suggestion",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    const complementsCount = await Ticket.count({
      where: {
        category: "Compliment",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    // New Tickets: last 10 days
    const newTicketsCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        assigned_to_id: req.user.userId,
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    console.log('New Tickets Count Query Result:', newTicketsCount);
    console.log('Reviewer User ID:', req.user.userId);

    // Escalated Tickets: 
    const escalatedTicketsCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        // [Op.or]: [
        //   { responsible_unit_name: null },
        //   { responsible_unit_name: "Public Relation Unit" }
        // ],
        [Op.and]: [
          { [Op.or]: [{ status: '' }, { status: "Escalated" }] },
          { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
        ]
      }
    });

    console.log('Escalated Tickets Count Query Result:', escalatedTicketsCount);

    // Channeled Tickets Breakdown
    const directorateCount = await Ticket.count({
      where: {
        responsible_unit_name: { [Op.like]: "%Directorate%" },
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.notIn]: ['Closed', 'Open'] }
      }
    });

    const unitsCount = await Ticket.count({
      where: {
        responsible_unit_name: { [Op.like]: "%Unit%" },
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.notIn]: ['Closed', 'Open'] }
      }
    });

          // Ticket Status Breakdown - Filtered by reviewer and excluding forwarded tickets
    const closedCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: "Closed"
      }
    });

    const minorCount = await Ticket.count({
      where: {
        complaint_type: "Minor",
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }
      }
    });

    const majorCount = await Ticket.count({
      where: {
        complaint_type: "Major",
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }
      }
    });

    // Count open tickets
    const openCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: "Open",
        assigned_to_id: req.user.userId
      }
    });

    // Count assigned tickets
    const assignedCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: "Assigned",
        assigned_to_id: req.user.userId
      }
    });

    const ticketStatus = {
      "Open": openCount,
      "Assigned": assignedCount,
      Closed: closedCount,
      Minor: minorCount,
      Major: majorCount
      // add other statuses if needed
    };

    const ticketStatusTotal = Object.values(ticketStatus).reduce((a, b) => 0 + b, 0);

    console.log('New Tickets Total Calculation:', newTicketsCount + escalatedTicketsCount);

    res.status(200).json({
      message: "Dashboard counts retrieved successfully",
      ticketStats: {
        newTickets: {
          "Total": newTicketsCount + escalatedTicketsCount, // Fix: Use sum of sub-categories
          "New Tickets": newTicketsCount,
          "Escalated Tickets": escalatedTicketsCount
        },
        convertedTickets: {
          Complaints: complaintsCount,
          Suggestions: suggestionsCount,
          Compliments: complementsCount
        },
        channeledTickets: {
          Directorate: directorateCount,
          Units: unitsCount
        },
        ticketStatus,
        ticketStatusTotal
      }
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getTicketsByCategoryAndType = async (req, res) => {
  try {
    const { category, type, userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    let whereClause = {};
    let includeClause = [
      {
        model: User,
        as: "creator",
        attributes: ["id", "name", "username", "email"]
      },
      {
        model: User,
        as: "ratedBy",
        attributes: ["id", "name", "email"]
      }
    ];

    // Build where clause based on category and type
    switch (category) {
      case "new":
        whereClause = {
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          assigned_to_id: req.user.userId,
          [Op.and]: [
            { status: { [Op.in]: ["Open", "Reversed"] } },
            { status: { [Op.ne]: "Forwarded" } }
          ]
        };
        break;

      case "converted":
        switch (type) {
          case "inquiries":
            whereClause = { converted_to: "Inquiry" };
            break;
          case "complaints":
            whereClause = { converted_to: "Complaint" };
            break;
          case "suggestions":
            whereClause = { converted_to: "Suggestion" };
            break;
          case "complements":
            whereClause = { converted_to: "Compliment" };
            break;
        }
        break;

      case "channeled":
        switch (type) {
          case "directorate":
            whereClause = { assigned_to_role: "Directorate" };
            break;
          case "units":
            whereClause = { assigned_to_role: "Unit" };
            break;
        }
        break;

      case "status":
        switch (type) {
          case "open":
            whereClause = { status: "Open" };
            break;
          case "progress":
            whereClause = { status: "In Progress" };
            break;
          case "closed":
            whereClause = { status: "Closed" };
            break;
          case "minor":
            whereClause = { complaint_type: "Minor" };
            break;
          case "major":
            whereClause = { complaint_type: "Major" };
            break;
        }
        break;
    }

    // Add search condition if search term is provided
    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { ticket_id: { [Op.like]: `%${search}%` } },
          { name: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // Get total count for pagination
    const totalCount = await Ticket.count({
      where: whereClause,
      include: includeClause
    });

    // Get paginated tickets
    const tickets = await Ticket.findAll({
      where: whereClause,
      include: includeClause,
      order: [["created_at", "DESC"]],
      limit,
      offset
    });

    res.status(200).json({
      message: "Tickets fetched successfully",
      tickets,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// // Helper function to get tickets with common logic
// const getTicketsByStatus = async (userId, status, isOverdue = false) => {
//   const user = await User.findOne({
//     where: { id: userId },
//     attributes: ['id', 'full_name', 'role']
//   });

//   if (!user) {
//     throw new Error('User not found');
//   }

//   let whereClause = {};

//   if (isOverdue) {
//     const threeDaysAgo = new Date();
//     threeDaysAgo.setDate(threeDaysAgo.getDate() - 10);
//     whereClause = {
//       status: 'Open',
//       created_at: { [Op.lt]: threeDaysAgo }
//     };
//   } else {
//     whereClause = { status };
//   }

//   if (user.role !== 'super-admin') {
//     whereClause.assigned_to = userId;
//   }

//   const tickets = await Ticket.findAll({
//     where: whereClause,
//     include: [
//       {
//         model: User,
//         as: 'creator',
//         attributes: ['id', 'full_name', 'phone']
//       }
//     ],
//     order: [['created_at', 'DESC']]
//   });

//   return {
//     tickets,
//     user
//   };
// };

const getOpenTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Open", );

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Open tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching open tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAssignedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Assigned");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No assigned tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching assigned tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getInprogressTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "In Progress");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No in-progress tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "In-progress tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching in-progress tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCarriedForwardTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(
      userId,
      "Carried Forward"
    );

    if (tickets.length === 0) {
      return res
        .status(404)
        .json({ message: "No carried forward tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Carried forward tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching carried forward tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getClosedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Closed");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No closed tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Closed tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching closed tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOverdueTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Escalated", "", true);

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No overdue tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Overdue tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching overdue tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const getTicketsByStatus = async (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = {
      [Op.or]: [
        { category: "Complaint" },
        { category: "Suggestion" },
        { category: "Compliment" }
      ]
    };

    switch (status) {
      case "new":
        // For "new" tickets: show tickets assigned to reviewer that are:
        // - Open, Assigned, Reversed, or null status
        // - Not Forwarded
        // - Can be already rated (complaint_type set) but still need reviewer action
        // Check both assigned_to_id and assigned_to_role to catch all reviewer tickets
        whereClause = {
          [Op.and]: [
            {
              category: {
                [Op.in]: ["Complaint", "Suggestion", "Compliment"]
              }
            },
            {
              [Op.or]: [
                { assigned_to_id: req.user.userId },
                { assigned_to_role: "reviewer" }
              ]
            },
            {
              [Op.or]: [
                { status: null },
                { status: "Open" },
                { status: "Assigned" },
                { status: "Reversed" }
              ]
            },
            {
              status: { [Op.ne]: "Forwarded" }
            }
          ]
        };
        console.log('🔍 Reviewer "new" tickets query:', JSON.stringify(whereClause, null, 2));
        console.log('👤 Reviewer userId:', req.user.userId);
        console.log('👤 Reviewer role:', req.user.role);
        break;
        case "escalated":
          whereClause = {
            category: { [Op.in]: ['Complaint', 'Suggestion', 'Compliment'] },
            [Op.or]: [
              { status: 'Escalated' },
              { status: '' }
            ]
          };
          break;
      case "complaints":
        whereClause.category = { [Op.in]: ["Complaint"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "suggestions":
        whereClause.category = { [Op.in]: ["Suggestion"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "complements":
        whereClause.category = { [Op.in]: ["Compliment"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "directorate":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: { [Op.notIn]: ['Closed', 'Open'] } },
          { responsible_unit_name:  { [Op.like]: "%Directorate%" } }
          // { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
        case "units":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: { [Op.notIn]: ['Closed', 'Open'] } },
          { responsible_unit_name: { [Op.like]: "%Unit%" } }
          // { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "open":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
          { responsible_unit_name: { [Op.not]: null } },
          { status: { [Op.ne]: "Forwarded" } }
        ];
        break;
      case "on-progress":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: "In Progress" },
          { responsible_unit_name: { [Op.not]: null } }
        ];
        break;
      case "closed":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause.status = "Closed";
        break;
      case "minor":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Minor" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      case "major":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Major" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      case "major-returned":
        whereClause.category = "Complaint";
        whereClause[Op.and] = [
          { complaint_type: "Major" },
          { status: "Returned" }
        ];
        break;
      default:
        whereClause.status = status;
        whereClause[Op.and] = [{ status: { [Op.ne]: "Closed" } }];
        break;
    }

    const tickets = await Ticket.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'username', 'email']
        }
      ],
      order: [["created_at", "DESC"]]
    });

    console.log(`📊 Found ${tickets.length} tickets for status "${status}"`);
    if (status === "new" && tickets.length > 0) {
      console.log('📋 Sample ticket:', {
        id: tickets[0].id,
        ticket_id: tickets[0].ticket_id,
        status: tickets[0].status,
        assigned_to_id: tickets[0].assigned_to_id,
        category: tickets[0].category
      });
    } else if (status === "new" && tickets.length === 0) {
      console.log('⚠️ No tickets found for reviewer. Query:', JSON.stringify(whereClause, null, 2));
    }

    res.json({ tickets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Rate and complete registration of complaints
const rateAndRegisterComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { rating, registrationNotes } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Update ticket with rating and registration details
    await ticket.update({
      complaint_rating: rating,
      registration_notes: registrationNotes,
      registered_by: reviewerId,
      registration_date: new Date(),
      status: "Registered"
    });

    res.status(200).json({
      message: "Complaint rated and registered successfully",
      ticket
    });
  } catch (error) {
    console.error("Error rating and registering complaint:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Convert complaint to inquiry
const convertToInquiry = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { conversionReason } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Update ticket to inquiry
    await ticket.update({
      category: "Inquiry",
      converted_to: "Inquiry",
      conversion_reason: conversionReason,
      converted_by: reviewerId,
      conversion_date: new Date(),
      status: "Open"
    });

    res.status(200).json({
      message: "Complaint converted to inquiry successfully",
      ticket
    });
  } catch (error) {
    console.error("Error converting complaint to inquiry:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Channel complaint to appropriate unit
const channelComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { unitId, channelingNotes } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Get the supervisor of the unit
    const supervisor = await User.findOne({
      where: {
        role: "supervisor",
        unit_id: unitId
      }
    });

    if (!supervisor) {
      return res
        .status(404)
        .json({ message: "No supervisor found for the selected unit" });
    }

    // Update ticket with channeling details
    await ticket.update({
      assigned_to: supervisor.id,
      channeled_to_unit: unitId,
      channeling_notes: channelingNotes,
      channeled_by: reviewerId,
      channeling_date: new Date(),
      status: "Assigned"
    });

    res.status(200).json({
      message: "Complaint channeled successfully",
      ticket
    });
  } catch (error) {
    console.error("Error channeling complaint:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Reviewer closes a ticket
const closeReviewerTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution_details, resolution_type } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Handle attachment if uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("Attachment uploaded:", attachmentPath);
    }

    // Update ticket with resolution details and attachment path
    await ticket.update({
      status: 'Closed',
      resolution_details: resolution_details || 'Ticket closed by reviewer',
      resolution_type: resolution_type || 'Resolved',
      attachment_path: attachmentPath, // Save attachment path to ticket
      date_of_resolution: new Date(),
      attended_by_id: reviewerId
    });

    // Record in Ticket_assignments with attachment path
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: reviewerId,
      assigned_to_id: reviewerId,
      assigned_to_role: 'reviewer',
      action: 'Closed',
      reason: resolution_details || 'Ticket closed by reviewer',
      attachment_path: attachmentPath, // Save attachment path to assignment record
      created_at: new Date()
    });

    // Notify the creator (agent) by email if available
    const creator = await User.findOne({ where: { id: ticket.userId } });
    if (creator && creator.email) {
      const emailSubject = `Your Ticket Has Been Closed: ${ticket.subject} (ID: ${ticket.ticket_id})`;
      const bodyHtml = `
        <p>Dear ${creator.name || 'User'},</p>
        <p>Your ticket has been closed by a reviewer. Here are the details:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Description:</strong> ${ticket.description}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Resolution:</strong> ${resolution_details || 'Ticket closed by reviewer'}</li>
        </ul>
        <p>Thank you for using the WCF Customer Care System.</p>
      `;
      const emailBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      sendEmail({
        to:'grace.tarimo@wcf.go.tz',
        subject: emailSubject,
        htmlBody: emailBody
      }).catch(emailError => {
        console.error("Error sending closure email to creator:", emailError.message);
      });
    }

    console.log("Closing ticket details with attachment:", attachmentPath);
    res.status(200).json({
      message: "Ticket closed successfully by reviewer",
      ticket: {
        ...ticket.toJSON(),
        attachment_path: attachmentPath
      }
    });
  } catch (error) {
    console.error("Error closing ticket by reviewer:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllReviewerTickets,
  rateAndRegisterComplaint,
  convertToInquiry,
  channelComplaint,
  rateTickets,
  convertOrForwardTicket,
  getReviewerDashboardCounts,
  getTicketsByCategoryAndType,
  getOpenTickets,
  getAssignedTickets,
  getInprogressTickets,
  getCarriedForwardTickets,
  getClosedTickets,
  getOverdueTickets,
  getTicketsByStatus,
  closeReviewerTicket
};
>>>>>>> d60bce46dafbb4d57873619231b42e891f54935c
