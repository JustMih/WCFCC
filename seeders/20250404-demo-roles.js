'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Roles', [
      { name: 'admin', description: 'System Administrator', created_at: new Date(), updated_at: new Date() },
      { name: 'coordinator', description: 'Ticket Coordinator', created_at: new Date(), updated_at: new Date() },
      { name: 'attendee', description: 'Ticket Attendee', created_at: new Date(), updated_at: new Date() },
      { name: 'focal-person', description: 'Focal Person', created_at: new Date(), updated_at: new Date() },
      { name: 'supervisor', description: 'Supervisor', created_at: new Date(), updated_at: new Date() },
      { name: 'manager', description: 'Manager', created_at: new Date(), updated_at: new Date() },
      { name: 'director', description: 'Director', created_at: new Date(), updated_at: new Date() },
      { name: 'dg', description: 'Director General', created_at: new Date(), updated_at: new Date() }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Roles', null, {});
  }
}; 