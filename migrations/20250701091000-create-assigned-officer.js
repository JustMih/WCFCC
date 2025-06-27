'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('assigned_Officers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      ticket_id: { type: Sequelize.INTEGER, allowNull: false },
      assigned_to_id: { type: Sequelize.INTEGER, allowNull: false },
      assigned_to_role: { type: Sequelize.STRING, allowNull: false },
      assigned_by_id: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING, defaultValue: 'Active' },
      assigned_at: { type: Sequelize.DATE, defaultValue: Sequelize.NOW },
      reassignment_reason: { type: Sequelize.STRING },
      completed_at: { type: Sequelize.DATE },
      notes: { type: Sequelize.STRING }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('assigned_Officers');
  }
}; 