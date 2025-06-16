const axios = require('axios');
const fs = require('fs');
const path = require('path');
const InstagramComment = require("../../models/instagram_comment");

const VERIFY_TOKEN = "hBS9uiaIdMMmJmFw6N72FqOa2en9XGD2H";
const ACCESS_TOKEN = 'EAAIIcLFpkvYBO5mbvYnw56QqWq3gBBW9zsmqvhRJVnGeJQLAygg6HAHxFmzo0BAxPMm2jBICN1VbG39eTK64xLY3IX40dZAWeXwXg6mkWxZApRQlT57ITDEmsyjm6xZBTx3Mt1CHZBYN0SHjiTNInZBzZCi355z39tnJvIbAuXnQyOhKgIsZAxY309HkN5RW064eTPO1qze4ENVZAyMQWyqnqtKmsQZDZD';
const FIELDS = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,username';

async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ IG Webhook Verified with token:", token);
    return res.status(200).send(challenge);
  }

  console.log("❌ IG Webhook verification failed", { mode, token });
  return res.sendStatus(403);
}

async function handleWebhook(req, res) {
  const payload = req.body;
  let saved = false;

  try {
    console.log("📥 Incoming Payload:", JSON.stringify(payload, null, 2));

    async function extractAndSave(obj) {
      if (obj && typeof obj === 'object') {
        if (obj.field === "comments" && obj.value) {
          const value = obj.value;
          await InstagramComment.create({
            id: value.id || `raw_${Date.now()}`,
            media_id: value.media?.id || value.media_id || null,
            parent_id: value.parent_id || null,
            text: value.text ? value.text : JSON.stringify(value),
            from_id: value.from?.id || value.from_id || null,
            from_username: value.from?.username || value.from_username || null,
            raw_payload: value,
            unread: true,
            created_at: new Date()
          });
          saved = true;
        } else if (obj.field === "messages" && obj.value) {
          const value = obj.value;
          await InstagramComment.create({
            id: value.message?.mid || `raw_${Date.now()}`,
            media_id: null,
            parent_id: null,
            text: value.message?.text || JSON.stringify(value),
            from_id: value.sender?.id || null,
            from_username: null,
            raw_payload: value,
            unread: true,
            created_at: new Date()
          });
          saved = true;
        }

        for (const key in obj) {
          await extractAndSave(obj[key]);
        }
      }
    }

    await extractAndSave(payload);

    if (!saved) {
      await InstagramComment.create({
        id: `raw_${Date.now()}`,
        media_id: payload.media_id || null,
        parent_id: payload.parent_id || null,
        text: JSON.stringify(payload),
        from_id: payload.from_id || null,
        from_username: payload.from_username || null,
        raw_payload: payload,
        unread: true,
        created_at: new Date()
      });
      console.log("✅ Raw payload saved to database with Instagram comment structure");
    } else {
      console.log("✅ Instagram comment or message saved from webhook payload");
    }

    return res.status(200).send("EVENT_RECEIVED");
  } catch (err) {
    console.error("❌ Webhook processing error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

// async function getAllComments(req, res) {
//   try {
//     const comments = await InstagramComment.findAll({
//       order: [['created_at', 'DESC']]
//     });
//     res.status(200).json({ comments });
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch comments' });
//   }
// }

const getAllComments = async (req, res) => {
    try {
      const comments = await InstagramComment.findAll(); // or whatever model you're using
      res.json({ comments });
    } catch (error) {
      console.error("Error fetching Instagram comments:", error);
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  };

//   exports.markCommentAsReplied = async (req, res) => {
//     try {
//       const { id } = req.params;
//       const { reply } = req.body;
  
//       if (!reply || !reply.trim()) {
//         return res.status(400).json({ error: "Reply text is required" });
//       }
  
//       const [updated] = await InstagramComment.update(
//         { replied: true, reply },
//         { where: { id } }
//       );
  
//       if (updated) {
//         return res.status(200).json({ message: "Marked as replied", reply });
//       } else {
//         return res.status(404).json({ error: "Comment not found" });
//       }
//     } catch (err) {
//       console.error("Reply update failed:", err);
//       res.status(500).json({ error: "Failed to mark as replied" });
//     }
//   };
  

async function markCommentAsRead(req, res) {
  try {
    const { id } = req.params;
    const [updated] = await InstagramComment.update(
      { unread: false },
      { where: { id } }
    );
    if (updated) {
      res.status(200).json({ message: "Marked as read" });
    } else {
      res.status(404).json({ error: "Comment not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to update comment" });
  }
}

// Mark a comment as replied and save reply text

const markCommentAsReplied = async (req, res) => {
    const { id } = req.params;
    const { reply } = req.body;
  
    try {
      // Find the Instagram comment by primary key
      const comment = await InstagramComment.findByPk(id);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }
  
      // Get user info from decoded JWT (make sure middleware sets req.user)
      const userName = req?.user?.name || "Anonymous";
  
      // Update fields
      comment.reply = reply;
      comment.replied_by = userName;
      comment.replied_at = new Date();
      comment.replied = true;
  
      // Save to DB
      await comment.save();
  
      console.log(`✅ Replied by: ${userName}, ID: ${id}, Reply: ${reply}`);
  
      // Return updated info
      res.json({
        success: true,
        replied_by: comment.replied_by,
        replied_at: comment.replied_at,
        reply: comment.reply,
      });
    } catch (error) {
      console.error("❌ Reply save error:", error);
      res.status(500).json({ error: "Failed to save reply" });
    }
  };
  

// Mark a comment as read
const markCommentRead = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await InstagramComment.findByPk(id);
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    comment.read = true;
    comment.unread = false;
    await comment.save();
    res.status(200).json({ message: "Comment marked as read", comment });
  } catch (err) {
    res.status(500).json({ error: "Failed to update comment as read" });
  }
};

// Unified export
module.exports = {
  verifyWebhook,
  handleWebhook,
  getAllComments,
  markCommentAsRead,
  markCommentRead,
  markCommentAsReplied,
};
