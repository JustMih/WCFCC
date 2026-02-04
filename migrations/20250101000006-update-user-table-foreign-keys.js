// "use strict";
// module.exports = {
//   up: async (queryInterface, Sequelize) => {
//     // First, add new foreign key columns
//     await queryInterface.addColumn("Users", "report_to_id", {
//       type: Sequelize.INTEGER,
//       allowNull: true,
//       references: {
//         model: "ReportTo",
//         key: "id",
//       },
//       onUpdate: "CASCADE",
//       onDelete: "SET NULL",
//     });

//     await queryInterface.addColumn("Users", "designation_id", {
//       type: Sequelize.INTEGER,
//       allowNull: true,
//       references: {
//         model: "Designation",
//         key: "id",
//       },
//       onUpdate: "CASCADE",
//       onDelete: "SET NULL",
//     });

//     await queryInterface.addColumn("Users", "unit_section_id", {
//       type: Sequelize.INTEGER,
//       allowNull: true,
//       references: {
//         model: "UnitSection",
//         key: "id",
//       },
//       onUpdate: "CASCADE",
//       onDelete: "SET NULL",
//     });

//     // Remove the old string columns after adding foreign keys
//     await queryInterface.removeColumn("Users", "report_to");
//     await queryInterface.removeColumn("Users", "designation");
//     await queryInterface.removeColumn("Users", "unit_section");
//   },
//   down: async (queryInterface, Sequelize) => {
//     // Add back the old string columns
//     await queryInterface.addColumn("Users", "report_to", {
//       type: Sequelize.STRING(100),
//       allowNull: true,
//     });

//     await queryInterface.addColumn("Users", "designation", {
//       type: Sequelize.STRING(100),
//       allowNull: true,
//     });

//     await queryInterface.addColumn("Users", "unit_section", {
//       type: Sequelize.STRING(100),
//       allowNull: true,
//     });

//     // Remove the foreign key columns
//     await queryInterface.removeColumn("Users", "report_to_id");
//     await queryInterface.removeColumn("Users", "designation_id");
//     await queryInterface.removeColumn("Users", "unit_section_id");
//   },
// };
