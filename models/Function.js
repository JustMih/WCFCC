const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const Function = sequelize.define(
  'Function',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    section_id: {
      type: DataTypes.UUID,
      references: { model: 'Sections', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_by: DataTypes.UUID,
    created_at: DataTypes.DATE,
    updated_by: DataTypes.UUID,
    updated_at: DataTypes.DATE,
  },
  {
    tableName: 'functions',
    timestamps: false,
    underscored: true,
  }
);

Function.associate = (models) => {
  Function.belongsTo(models.Section, { foreignKey: 'section_id', as: 'section' });
  Function.hasMany(models.FunctionData, { foreignKey: 'function_id', as: 'functionData' });
  Function.hasMany(models.Ticket, { foreignKey: 'responsible_unit_id', as: 'tickets' });
};

module.exports = Function;
