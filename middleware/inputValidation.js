const { body, validationResult } = require('express-validator');

// Validation rules for external API
const validateTicketSearch = [
  body('phone_number')
    .optional()
    .isMobilePhone('any')
    .withMessage('Phone number must be a valid mobile number'),
  
  body('ticket_number')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Ticket number must be between 1 and 50 characters')
    .matches(/^[A-Za-z0-9\-_]+$/)
    .withMessage('Ticket number can only contain letters, numbers, hyphens, and underscores'),
  
  // Custom validation to ensure at least one search parameter is provided
  body()
    .custom((value, { req }) => {
      if (!req.body.phone_number && !req.body.ticket_number) {
        throw new Error('Either phone_number or ticket_number is required');
      }
      return true;
    })
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
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