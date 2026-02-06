'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.addColumn("Users", "report_to", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("Users", "designation", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });

    // change name to full_name
    await queryInterface.renameColumn("Users", "name", "full_name");
  },

  async down (queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.removeColumn('Users', 'report_to');
    await queryInterface.removeColumn('Users', 'designation');
    await queryInterface.renameColumn("Users", "full_name", "name");
  }
};
