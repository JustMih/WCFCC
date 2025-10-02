'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, update any existing users with 'coordinator' role to 'reviewer'
    await queryInterface.sequelize.query(`
      UPDATE Users 
      SET role = 'reviewer' 
      WHERE role = 'coordinator'
    `);

    // Then remove 'coordinator' from the role ENUM
    await queryInterface.sequelize.query(`
      ALTER TABLE Users 
      MODIFY COLUMN role ENUM(
        'super-admin',
        'admin', 
        'supervisor',
        'agent',
        'attendee',
        'reviewer',
        'focal-person',
        'claim-focal-person',
        'compliance-focal-person',
        'head-of-unit',
        'director',
        'manager',
        'director-general'
      ) NOT NULL DEFAULT 'agent'
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Add 'coordinator' back to the role ENUM
    await queryInterface.sequelize.query(`
      ALTER TABLE Users 
      MODIFY COLUMN role ENUM(
        'super-admin',
        'admin', 
        'supervisor',
        'agent',
        'attendee',
        'coordinator',
        'reviewer',
        'focal-person',
        'claim-focal-person',
        'compliance-focal-person',
        'head-of-unit',
        'director',
        'manager',
        'director-general'
      ) NOT NULL DEFAULT 'agent'
    `);
  }
};
