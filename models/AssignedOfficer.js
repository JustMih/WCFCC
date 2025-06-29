// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/mysql_connection');

// const AssignedOfficer = sequelize.define('AssignedOfficer', {
//   id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
//   ticket_id: { type: DataTypes.INTEGER, allowNull: false },
//   assigned_to_id: { type: DataTypes.INTEGER, allowNull: false },
//   assigned_to_role: { type: DataTypes.STRING, allowNull: false },
//   assigned_by_id: { type: DataTypes.INTEGER, allowNull: false },
//   status: { type: DataTypes.STRING, defaultValue: 'Active' },
//   assigned_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
//   reassignment_reason: { type: DataTypes.STRING },
//   completed_at: { type: DataTypes.DATE },
//   notes: { type: DataTypes.STRING }
// }, {
//   tableName: 'assigned_officers',
//   timestamps: false
// });

// // Define associations
// AssignedOfficer.associate = (models) => {
//   AssignedOfficer.belongsTo(models.User, {
//     foreignKey: 'assigned_to_id',
//     as: 'assignedTo'
//   });

//   AssignedOfficer.hasMany(models.Ticket, {
//     foreignKey: 'assigned_officer_id',
//     as: 'tickets'
//   });
// };

// module.exports = AssignedOfficer; 