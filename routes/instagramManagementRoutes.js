const express = require('express');
const router = express.Router();
const {
  getAllInstagramData,
  markCommentAsRead,
  markMessageAsRead,
  replyToComment,
  replyToMessage,
  getInstagramStats,
  markMultipleAsRead,
  createInstagramPost,
  getAllInstagramPosts,
  updateInstagramPost,
  deleteInstagramPost
} = require('../controllers/social_medias/instagramManagementController');

const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

// Get all Instagram data (comments and messages)
router.get('/data', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  getAllInstagramData
);

// Get Instagram statistics
router.get('/stats', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  getInstagramStats
);

// Mark comment as read
router.put('/comments/:id/read', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  markCommentAsRead
);

// Mark message as read
router.put('/messages/:id/read', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  markMessageAsRead
);

// Reply to comment
router.post('/comments/:id/reply', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  replyToComment
);

// Reply to message
router.post('/messages/:id/reply', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  replyToMessage
);

// Mark multiple items as read
router.put('/mark-multiple-read', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  markMultipleAsRead
);

// Instagram Posts Management
// Create new Instagram post
router.post('/posts', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  createInstagramPost
);

// Get all Instagram posts
router.get('/posts', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  getAllInstagramPosts
);

// Update Instagram post
router.put('/posts/:id', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  updateInstagramPost
);

// Delete Instagram post
router.delete('/posts/:id', 
  authMiddleware,
  roleMiddleware(['supervisor', 'admin']),
  deleteInstagramPost
);

module.exports = router;
