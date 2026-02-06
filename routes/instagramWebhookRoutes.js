const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhook, getAllComments, markCommentAsRead, markCommentAsReplied  } = require('../controllers/social_medias/instagramController');
const InstagramComment = require('../models/instagram_comment');
const InstagramMessage = require('../models/instagram_message');

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

// Test endpoints for creating sample data
// Test endpoint to create a test comment using real Facebook webhook structure
router.post('/test-comment', async (req, res) => {
  try {
    console.log('📝 Creating test comment with real Facebook webhook structure...');
    
    // Using the exact structure from Facebook webhook (comments field sample)
    const uniqueId = Date.now();
    const facebookWebhookPayload = {
      field: "comments",
      value: {
        from: {
          id: "232323232",
          username: "test"
        },
        media: {
          id: "123123123",
          media_product_type: "FEED"
        },
        id: uniqueId.toString(),
        parent_id: "1231231234",
        text: "This is an example."
      }
    };

    const comment = await InstagramComment.create({
      id: parseInt(facebookWebhookPayload.value.id),
      media_id: parseInt(facebookWebhookPayload.value.media.id),
      parent_id: parseInt(facebookWebhookPayload.value.parent_id),
      text: facebookWebhookPayload.value.text,
      from_id: parseInt(facebookWebhookPayload.value.from.id),
      from_username: facebookWebhookPayload.value.from.username,
      raw_payload: facebookWebhookPayload,
      unread: true,
      read: false,
      replied: false
    });

    console.log('✅ Test comment created with Facebook structure:', comment.id);
    res.status(201).json({
      success: true,
      message: 'Test comment created successfully with real Facebook webhook structure',
      comment,
      webhook_payload: facebookWebhookPayload
    });
  } catch (error) {
    console.error('Error creating test comment:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to create test comment',
      details: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint to create a test message using real Facebook webhook structure
router.post('/test-message', async (req, res) => {
  try {
    console.log('📝 Creating test message with real Facebook webhook structure...');
    
    // Using the exact structure from Facebook webhook (messages field sample)
    const uniqueId = Date.now();
    const uniqueMid = `msg_${uniqueId}`;
    const facebookWebhookPayload = {
      field: "messages",
      value: {
        sender: {
          id: "12334"
        },
        recipient: {
          id: "23245"
        },
        timestamp: "1527459824",
        message: {
          mid: uniqueMid,
          text: "random_text"
        }
      }
    };

    const message = await InstagramMessage.create({
      id: uniqueId,
      sender_id: parseInt(facebookWebhookPayload.value.sender.id),
      sender_username: `sender_${facebookWebhookPayload.value.sender.id}`,
      text: facebookWebhookPayload.value.message.text,
      message_type: 'text',
      raw_payload: facebookWebhookPayload,
      unread: true,
      read: false,
      replied: false
    });

    console.log('✅ Test message created with Facebook structure:', message.id);
    res.status(201).json({
      success: true,
      message: 'Test message created successfully with real Facebook webhook structure',
      message,
      webhook_payload: facebookWebhookPayload
    });
  } catch (error) {
    console.error('Error creating test message:', error);
    res.status(500).json({ error: 'Failed to create test message' });
  }
});

// Test endpoint to create multiple test comments
router.post('/test-comments-batch', async (req, res) => {
  try {
    const { count = 5 } = req.body;
    const comments = [];

    for (let i = 0; i < count; i++) {
      const uniqueId = Date.now() + i;
      const comment = await InstagramComment.create({
        id: uniqueId,
        media_id: uniqueId,
        text: `Test comment ${i + 1}: This is a sample comment for testing`,
        from_id: uniqueId,
        from_username: `test_user_${i + 1}`,
        raw_payload: {
          field: "comments",
          value: {
            from: {
              id: uniqueId.toString(),
              username: `test_user_${i + 1}`
            },
            media: {
              id: uniqueId.toString(),
              media_product_type: "FEED"
            },
            id: uniqueId.toString(),
            text: `Test comment ${i + 1}: This is a sample comment for testing`
          }
        },
        unread: true,
        read: false,
        replied: false
      });
      comments.push(comment);
    }

    res.status(201).json({
      success: true,
      message: `${count} test comments created successfully`,
      comments
    });
  } catch (error) {
    console.error('Error creating test comments batch:', error);
    res.status(500).json({ error: 'Failed to create test comments batch' });
  }
});

// Test endpoint to create multiple test messages
router.post('/test-messages-batch', async (req, res) => {
  try {
    const { count = 5 } = req.body;
    const messages = [];

    for (let i = 0; i < count; i++) {
      const uniqueId = Date.now() + i;
      const uniqueMid = `msg_${uniqueId}`;
      const message = await InstagramMessage.create({
        id: uniqueId,
        sender_id: uniqueId,
        sender_username: `test_sender_${i + 1}`,
        text: `Test message ${i + 1}: This is a sample message for testing`,
        message_type: 'text',
        raw_payload: {
          field: "messages",
          value: {
            sender: {
              id: uniqueId.toString()
            },
            recipient: {
              id: "23245"
            },
            timestamp: "1527459824",
            message: {
              mid: uniqueMid,
              text: `Test message ${i + 1}: This is a sample message for testing`
            }
          }
        },
        unread: true,
        read: false,
        replied: false
      });
      messages.push(message);
    }

    res.status(201).json({
      success: true,
      message: `${count} test messages created successfully`,
      messages
    });
  } catch (error) {
    console.error('Error creating test messages batch:', error);
    res.status(500).json({ error: 'Failed to create test messages batch' });
  }
});

module.exports = router; 