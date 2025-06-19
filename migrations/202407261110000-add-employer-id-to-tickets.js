'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'employer_id', {
      type: Sequelize.UUID,
      allowNull: true, // It can be null if the requester is not an employer
      references: {
        model: 'Employers',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL', // If an employer is deleted, set their tickets' employer_id to null
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Tickets', 'employer_id');
  },
}; 