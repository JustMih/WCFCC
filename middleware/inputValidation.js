const { body, validationResult } = require('express-validator');

// Validation rules for external API
const validateTicketSearch = [
  body('phone_number')
    .optional()
    .custom((value) => {
      // Skip validation if empty string
      if (!value || value.trim() === '') {
        return true;
      }
      // Validate only if value exists
      if (!/^\+?[0-9]{10,15}$/.test(value.trim())) {
        throw new Error('Phone number must be a valid mobile number');
      }
      return true;
    }),
  
  body('ticket_number')
    .optional()
    .custom((value) => {
      // Skip validation if empty string
      if (!value || value.trim() === '') {
        return true;
      }
      // Validate only if value exists
      const trimmedValue = value.trim();
      if (trimmedValue.length < 1 || trimmedValue.length > 50) {
        throw new Error('Ticket number must be between 1 and 50 characters');
      }
      if (!/^[A-Za-z0-9\-_]+$/.test(trimmedValue)) {
        throw new Error('Ticket number can only contain letters, numbers, hyphens, and underscores');
      }
      return true;
    }),
  
  // Custom validation to ensure at least one search parameter is provided
  body()
    .custom((value, { req }) => {
      const phoneNumber = req.body.phone_number && req.body.phone_number.trim() !== '' ? req.body.phone_number.trim() : null;
      const ticketNumber = req.body.ticket_number && req.body.ticket_number.trim() !== '' ? req.body.ticket_number.trim() : null;
      
      if (!phoneNumber && !ticketNumber) {
        throw new Error('Either phone_number or ticket_number is required');
      }
      return true;
    })
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validation Error:', {
      body: req.body,
      errors: errors.array()
    });
    
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: 'VALIDATION_ERROR',
      details: errors.array()
    });
  }
  next();
};

module.exports = {
  validateTicketSearch,
  handleValidationErrors
}; 