'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AssignedOfficers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      first_name: Sequelize.STRING,
      middle_name: Sequelize.STRING,
      last_name: Sequelize.STRING,
      nida_number: Sequelize.STRING,
      phone_number: Sequelize.STRING,
      employer_id: Sequelize.STRING,
      assigned_to_id: {
        type: Sequelize.UUID,
        references: {
          model: 'Users',
          key: 'id',
        },
        onDelete: 'SET NULL',
      },
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('AssignedOfficers');
  }
};
