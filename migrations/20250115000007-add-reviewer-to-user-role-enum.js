'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, let's check what roles exist in the database
    const [results] = await queryInterface.sequelize.query(`
      SELECT DISTINCT role FROM Users WHERE role IS NOT NULL
    `);
    
    console.log('Existing roles in database:', results.map(r => r.role));
    
    // Update any invalid roles to 'agent' before modifying the ENUM
    await queryInterface.sequelize.query(`
      UPDATE Users 
      SET role = 'agent' 
      WHERE role NOT IN (
        'super-admin', 'admin', 'supervisor', 'agent', 'attendee', 
        'focal-person', 'claim-focal-person', 'compliance-focal-person', 
        'head-of-unit', 'director', 'manager', 'director-general'
      )
    `);
    
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
