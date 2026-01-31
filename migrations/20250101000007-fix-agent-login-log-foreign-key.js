module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // First, drop the existing foreign key constraint
      await queryInterface.removeConstraint(
        "AgentLoginLog",
        "AgentLoginLog_ibfk_1"
      );
    } catch (error) {
      console.log("Foreign key constraint may not exist:", error.message);
    }

    // Clean up orphaned records in AgentLoginLog that don't have corresponding Users
    await queryInterface.sequelize.query(`
      DELETE FROM AgentLoginLog 
      WHERE userId NOT IN (SELECT id FROM Users)
    `);

    // Ensure the Users table has a primary key on the id column
    try {
      await queryInterface.addIndex("Users", ["id"], {
        unique: true,
        name: "Users_id_unique",
      });
    } catch (error) {
      console.log("Index may already exist:", error.message);
    }

    // Add the new foreign key constraint pointing to the correct Users table
    await queryInterface.addConstraint("AgentLoginLog", {
      fields: ["userId"],
      type: "foreign key",
      name: "AgentLoginLog_ibfk_1",
      references: {
        table: "Users",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Remove the foreign key constraint
      await queryInterface.removeConstraint(
        "AgentLoginLog",
        "AgentLoginLog_ibfk_1"
      );
    } catch (error) {
      console.log("Foreign key constraint may not exist:", error.message);
    }

    // Add back the old foreign key constraint (if needed)
    await queryInterface.addConstraint("AgentLoginLog", {
      fields: ["userId"],
      type: "foreign key",
      name: "AgentLoginLog_ibfk_1",
      references: {
        table: "Users_bak",
        field: "id",
      },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
  },
};
