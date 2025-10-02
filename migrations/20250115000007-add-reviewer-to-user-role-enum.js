'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add 'reviewer' to the role ENUM
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
    // Remove 'reviewer' from the role ENUM
    await queryInterface.sequelize.query(`
      ALTER TABLE Users 
      MODIFY COLUMN role ENUM(
        'super-admin',
        'admin', 
        'supervisor',
        'agent',
        'attendee',
        'coordinator',
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
