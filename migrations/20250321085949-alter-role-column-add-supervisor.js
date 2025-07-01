// migrations/[timestamp]-alter-role-column-to-varchar.js

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM(
        "admin",
        "super-admin",
        "user",
        "agent",
        "attendee",
        "coordinator",
        "head-of-unit",
        "manager",
        "director",
        "focal-person",
        "director-general",
        "supervisor"
      ), // Change role column type to VARCHAR(20)
      allowNull: false, // Ensure this matches your previous column constraint (e.g., `allowNull: false`)
    });
  },

  down: async (queryInterface, Sequelize) => {
    // In case you want to revert the change back to ENUM
    await queryInterface.changeColumn("Users", "role", {
      type: Sequelize.ENUM("admin", "super-admin", "user", "agent"), // Revert to your previous ENUM values
      allowNull: false, // Ensure this matches the original column constraint
    });
  },
};
