const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const FunctionData = sequelize.define(
  'FunctionData',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: DataTypes.STRING,
    function_id: {
      type: DataTypes.INTEGER,
      references: { model: 'functions', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_by: DataTypes.UUID,
    created_at: DataTypes.DATE,
    updated_by: DataTypes.UUID,
    updated_at: DataTypes.DATE,
  },
  {
    tableName: 'function_data',
    timestamps: false,
  }
);

FunctionData.associate = (models) => {
  FunctionData.belongsTo(models.Function, { foreignKey: 'function_id', as: 'parentFunction' });
};


module.exports = FunctionData;
