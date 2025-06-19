const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhook, getAllComments, markCommentAsRead, markCommentAsReplied  } = require('../controllers/social_medias/instagramController');

const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

// Instagram webhook verification endpoint
router.get('/comments', verifyWebhook
   
);

// Instagram webhook event endpoint
router.post('/comments', handleWebhook);

// Get all Instagram comments/messages
router.get('/all-comments', 
    authMiddleware,
    roleMiddleware(['supervisor']),
    getAllComments,
);

// Mark comment as read
router.put('/mark-comment-read/:id', markCommentAsRead);

router.put('/mark-comment-replied/:id', 
    authMiddleware,
    roleMiddleware(['supervisor']),
    markCommentAsReplied,
 );



module.exports = router; 