const sequelize = require("./config/mysql_connection.js");

async function markAllMessagesAsRead() {
  try {
    console.log("Marking all messages as read...");

    // Update all messages to be read
    const [updateResult] = await sequelize.query(`
      UPDATE ChatMassage 
      SET isRead = TRUE 
      WHERE isRead = FALSE
    `);

    console.log(`✅ ${updateResult.affectedRows} messages marked as read!`);

    // Verify the update
    const [unreadCount] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM ChatMassage 
      WHERE isRead = FALSE
    `);

    console.log("Remaining unread messages:", unreadCount[0].count);

    // Show some sample messages
    const [messages] = await sequelize.query(`
      SELECT id, senderId, receiverId, message, isRead, createdAt 
      FROM ChatMassage 
      ORDER BY createdAt DESC 
      LIMIT 10
    `);

    console.log("Sample messages after update:");
    messages.forEach((msg) => {
      console.log(
        `ID: ${msg.id}, Read: ${msg.isRead}, Message: ${msg.message.substring(
          0,
          30
        )}...`
      );
    });
  } catch (error) {
    console.error("❌ Error marking messages as read:", error);
  } finally {
    await sequelize.close();
  }
}

markAllMessagesAsRead();
