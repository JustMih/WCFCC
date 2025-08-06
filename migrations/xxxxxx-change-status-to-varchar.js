// Migration: Change 'status' column in 'Tickets' from ENUM to STRING(32)
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Tickets', 'status', {
      type: Sequelize.STRING(32),
      allowNull: false,
      defaultValue: 'Open'
    });
  },
  down: async (queryInterface, Sequelize) => {
    // Revert to ENUM (add your original ENUM values here)
    await queryInterface.changeColumn('Tickets', 'status', {
      type: Sequelize.ENUM('Open', 'Assigned', 'Closed', 'Carried Forward', 'In Progress', 'Returned', 'Forwarded'),
      allowNull: false,
      defaultValue: 'Open'
    });
  }
}; 