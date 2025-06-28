'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Update the ENUM for the 'role' column
    await queryInterface.changeColumn('Users', 'role', {
      type: Sequelize.ENUM(
        'admin',
        'super-admin',
        'user',
        'agent',
        'attendee',
        'coordinator',
        'head-of-unit',
        'manager',
        'director',
        'focal-person',
        'director-general'
      ),
      allowNull: false,
    });

    // 2. Add the 'unit_section' column if it doesn't exist
    const table = await queryInterface.describeTable('Users');
    if (!table.unit_section) {
      await queryInterface.addColumn('Users', 'unit_section', {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Revert ENUM to a minimal set (customize as needed)
    await queryInterface.changeColumn('Users', 'role', {
      type: Sequelize.ENUM('admin', 'super-admin', 'user', 'agent'),
      allowNull: false,
    });

    // Optionally, remove the 'unit_section' column
    // await queryInterface.removeColumn('Users', 'unit_section');
  }
};