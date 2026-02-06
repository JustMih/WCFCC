const sequelize = require("./config/mysql_connection.js");

async function addIsReadColumn() {
  try {
    console.log("Adding isRead column to ChatMassage table...");

    await sequelize.query(`
      ALTER TABLE ChatMassage 
      ADD COLUMN isRead BOOLEAN NOT NULL DEFAULT FALSE
    `);

    console.log("✅ isRead column added successfully!");

    // Update existing messages to have isRead = false
    await sequelize.query(`
      UPDATE ChatMassage 
      SET isRead = FALSE 
      WHERE isRead IS NULL
    `);

    console.log("✅ Existing messages updated with default isRead value!");
  } catch (error) {
    if (error.message.includes("Duplicate column name")) {
      console.log("ℹ️ isRead column already exists");
    } else {
      console.error("❌ Error adding isRead column:", error);
    }
  } finally {
    await sequelize.close();
  }
}

addIsReadColumn();
