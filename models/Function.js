const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const FunctionModel = sequelize.define('Function', {
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
}, {
  tableName: 'functions',
  timestamps: false,
  underscored: true,
});

FunctionModel.associate = (models) => {
  FunctionModel.belongsTo(models.Section, { foreignKey: 'section_id', as: 'section' });
  FunctionModel.hasMany(models.FunctionData, { foreignKey: 'function_id', as: 'functionData' });
  FunctionModel.hasMany(models.Ticket, { foreignKey: 'responsible_unit_id', as: 'tickets' });
};

module.exports = FunctionModel;
