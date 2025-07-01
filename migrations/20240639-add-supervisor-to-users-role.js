'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableName = 'Users';
    const columnName = 'role';

    // 🔁 Step 1: Convert ENUM column to STRING temporarily
    await queryInterface.changeColumn(tableName, columnName, {
      type: Sequelize.STRING,
      allowNull: false,
    });

    // 🧹 Step 2: (PostgreSQL only) Drop old ENUM type to avoid conflicts
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Users_role";');
    }

    // 🆕 Step 3: Define new ENUM values
    const roles = [
      'super-admin',
      'admin',
      'user',
      'agent',
      'attendee',
      'coordinator',
      'head-of-unit',
      'supervisor',
      'manager',
      'director',
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
    ];

    // ✅ Step 4: Convert column back to ENUM with the new values
    await queryInterface.changeColumn(tableName, columnName, {
      type: Sequelize.ENUM(...roles),
      allowNull: false,
      defaultValue: 'agent',
    });
  },

  down: async (queryInterface, Sequelize) => {
    const tableName = 'Users';
    const columnName = 'role';

    // 🔁 Step 1: Convert ENUM column to STRING temporarily
    await queryInterface.changeColumn(tableName, columnName, {
      type: Sequelize.STRING,
      allowNull: false,
    });

    // 🧹 Step 2: (PostgreSQL only) Drop modified ENUM type
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Users_role";');
    }

    // 🔙 Step 3: Revert back to previous ENUM list (without 'supervisor')
    const oldRoles = [
      'super-admin',
      'admin',
      'user',
      'agent',
      'attendee',
      'coordinator',
      'head-of-unit',
      'manager',
      'director',
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
    ];

    await queryInterface.changeColumn(tableName, columnName, {
      type: Sequelize.ENUM(...oldRoles),
      allowNull: false,
      defaultValue: 'agent',
    });
  }
};
