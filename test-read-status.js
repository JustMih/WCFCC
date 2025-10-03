const sequelize = require("./config/mysql_connection.js");

async function testReadStatus() {
  try {
    console.log("Testing read status functionality...");

    // Check if isRead column exists
    const [columns] = await sequelize.query(`
      DESCRIBE ChatMassage
    `);

    const hasIsReadColumn = columns.some((col) => col.Field === "isRead");
    console.log("Has isRead column:", hasIsReadColumn);

    if (!hasIsReadColumn) {
      console.log("Adding isRead column...");
      await sequelize.query(`
        ALTER TABLE ChatMassage 
        ADD COLUMN isRead BOOLEAN NOT NULL DEFAULT FALSE
      `);
      console.log("✅ isRead column added!");
    }

    // Get some sample messages
    const [messages] = await sequelize.query(`
      SELECT id, senderId, receiverId, message, isRead, createdAt 
      FROM ChatMassage 
      ORDER BY createdAt DESC 
      LIMIT 5
    `);

    console.log("Sample messages:", messages);

    // Test updating read status
    if (messages.length > 0) {
      const testMessage = messages[0];
      console.log(`Testing update for message ID: ${testMessage.id}`);

      const [updateResult] = await sequelize.query(
        `
        UPDATE ChatMassage 
        SET isRead = TRUE 
        WHERE id = ?
      `,
        [testMessage.id]
      );

      console.log("Update result:", updateResult);

      // Verify the update
      const [updatedMessage] = await sequelize.query(
        `
        SELECT id, senderId, receiverId, message, isRead, createdAt 
        FROM ChatMassage 
        WHERE id = ?
      `,
        [testMessage.id]
      );

      console.log("Updated message:", updatedMessage[0]);
    }

    // Count unread messages
    const [unreadCount] = await sequelize.query(`
      SELECT COUNT(*) as count 
      FROM ChatMassage 
      WHERE isRead = FALSE
    `);

    console.log("Total unread messages:", unreadCount[0].count);
  } catch (error) {
    console.error("❌ Error testing read status:", error);
  } finally {
    await sequelize.close();
  }
}

testReadStatus();
