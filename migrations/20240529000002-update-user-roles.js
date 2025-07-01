'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
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
        'director-general',
        'directorate of operations',
        'directorate of assessment services',
        'directorate of finance, planning and investment',
        'legal unit',
        'ict unit',
        'actuarial statistics and risk management',
        'public relation unit',
        'procurement management unit',
        'human resource management and attachment unit'
      ) NOT NULL DEFAULT 'super-admin';
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE Users 
      MODIFY COLUMN role ENUM(
        'super-admin',
        'admin',
        'supervisor',
        'agent',
        'attendee',
        'coordinator',
        'head-of-unit',
        'manager',
        'director',
        'focal-person',
        'director-general'
      ) NOT NULL DEFAULT 'super-admin';
    `);
  }
}; 