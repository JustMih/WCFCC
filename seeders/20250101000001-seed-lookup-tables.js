"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Seed ReportTo table
    await queryInterface.bulkInsert(
      "ReportTo",
      [
        {
          name: "Director General",
          description: "Reports to Director General",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Director",
          description: "Reports to Director",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Manager",
          description: "Reports to Manager",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Head of Unit",
          description: "Reports to Head of Unit",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Supervisor",
          description: "Reports to Supervisor",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );

    // Seed Designation table
    await queryInterface.bulkInsert(
      "Designation",
      [
        {
          name: "Director General",
          description: "Director General position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Director",
          description: "Director position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Manager",
          description: "Manager position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Head of Unit",
          description: "Head of Unit position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Supervisor",
          description: "Supervisor position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Agent",
          description: "Call Center Agent position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Coordinator",
          description: "Coordinator position",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Focal Person",
          description: "Focal Person position",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );

    // Seed UnitSection table
    await queryInterface.bulkInsert(
      "UnitSection",
      [
        {
          name: "Directorate of Operations",
          description: "Directorate responsible for operations",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "ICT Unit",
          description: "Information and Communication Technology Unit",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Customer Service Unit",
          description: "Unit responsible for customer service",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Compliance Unit",
          description: "Unit responsible for compliance",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Claims Unit",
          description: "Unit responsible for claims processing",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Administration Unit",
          description: "Unit responsible for administration",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );

    // Seed Role table
    await queryInterface.bulkInsert(
      "Role",
      [
        {
          name: "Super Admin",
          description: "Super Administrator with full system access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Admin",
          description: "Administrator with system management access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Supervisor",
          description: "Supervisor with team management capabilities",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Agent",
          description: "Call center agent with call handling capabilities",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Coordinator",
          description: "Coordinator with workflow management access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Head of Unit",
          description: "Head of Unit with unit management access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Manager",
          description: "Manager with department management access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Director",
          description: "Director with directorate management access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Director General",
          description: "Director General with organization-wide access",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Focal Person",
          description: "Focal Person with specific area responsibilities",
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          name: "Attendee",
          description: "Attendee with limited access",
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      {}
    );
  },

  down: async (queryInterface, Sequelize) => {
    // Remove seeded data
    await queryInterface.bulkDelete("Role", null, {});
    await queryInterface.bulkDelete("UnitSection", null, {});
    await queryInterface.bulkDelete("Designation", null, {});
    await queryInterface.bulkDelete("ReportTo", null, {});
  },
};
