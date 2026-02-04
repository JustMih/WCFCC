<<<<<<< HEAD
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create ticket attachments directory if it doesn't exist
const ticketAttachmentsDirectory = path.join(__dirname, "..", "ticket_attachments");
if (!fs.existsSync(ticketAttachmentsDirectory)) {
  fs.mkdirSync(ticketAttachmentsDirectory, { recursive: true });
}

// File filter function
const fileFilter = (req, file, cb) => {
  
  // Define allowed file types
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
  }
};

// Enhanced storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ticketAttachmentsDirectory);
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent security issues
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}_${sanitizedName}`;
    cb(null, fileName);
  },
});

// Enhanced limits
const limits = {
  fileSize: 2 * 1024 * 1024, // 2MB limit
  files: 5, // Maximum 5 files per request
  fieldNameSize: 100,
  fieldSize: 1024 * 1024, // 1MB for text fields
};

// Create multer instance with enhanced configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits,
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          message: 'File too large. Maximum size is 2MB.',
          error: error.message
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          message: 'Too many files. Maximum 5 files allowed.',
          error: error.message
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          message: 'Unexpected file field.',
          error: error.message
        });
      default:
        return res.status(400).json({
          message: 'File upload error.',
          error: error.message
        });
    }
  } else if (error) {
    return res.status(400).json({
      message: 'File upload error.',
      error: error.message
    });
  }
  next();
};

// Single file upload middleware
const uploadSingle = upload.single("attachment");

// Multiple files upload middleware
const uploadMultiple = upload.array("attachments", 5);

// Specific file types upload middleware
const uploadEvidence = upload.fields([
  { name: 'evidence', maxCount: 3 },
  { name: 'supporting_docs', maxCount: 2 }
]);

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadEvidence,
  handleMulterError,
  ticketAttachmentsDirectory
=======
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Create ticket attachments directory if it doesn't exist
const ticketAttachmentsDirectory = path.join(__dirname, "..", "ticket_attachments");
if (!fs.existsSync(ticketAttachmentsDirectory)) {
  fs.mkdirSync(ticketAttachmentsDirectory, { recursive: true });
}

// File filter function
const fileFilter = (req, file, cb) => {
  
  // Define allowed file types
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed.`), false);
  }
};

// Enhanced storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ticketAttachmentsDirectory);
  },
  filename: (req, file, cb) => {
    // Sanitize filename to prevent security issues
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}_${sanitizedName}`;
    cb(null, fileName);
  },
});

// Enhanced limits
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB limit
  files: 5, // Maximum 5 files per request
  fieldNameSize: 100,
  fieldSize: 1024 * 1024, // 1MB for text fields
};

// Create multer instance with enhanced configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: limits,
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          message: 'File too large. Maximum size is 10MB.',
          error: error.message
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          message: 'Too many files. Maximum 5 files allowed.',
          error: error.message
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          message: 'Unexpected file field.',
          error: error.message
        });
      default:
        return res.status(400).json({
          message: 'File upload error.',
          error: error.message
        });
    }
  } else if (error) {
    return res.status(400).json({
      message: 'File upload error.',
      error: error.message
    });
  }
  next();
};

// Single file upload middleware
const uploadSingle = upload.single("attachment");

// Multiple files upload middleware
const uploadMultiple = upload.array("attachments", 5);

// Specific file types upload middleware
const uploadEvidence = upload.fields([
  { name: 'evidence', maxCount: 3 },
  { name: 'supporting_docs', maxCount: 2 }
]);

module.exports = {
  upload,
  uploadSingle,
  uploadMultiple,
  uploadEvidence,
  handleMulterError,
  ticketAttachmentsDirectory
>>>>>>> d60bce46dafbb4d57873619231b42e891f54935c
}; 