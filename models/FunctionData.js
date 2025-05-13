const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const FunctionData = sequelize.define('FunctionData', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  name: { 
    type: DataTypes.STRING(100), 
    allowNull: false 
  },
  function_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { 
      model: 'functions', 
      key: 'id' 
    },
    onDelete: 'CASCADE'
  },
  created_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'function_data',
  timestamps: true,
  underscored: true
});

FunctionData.associate = (models) => {
  // A FunctionData belongs to a Function
  FunctionData.belongsTo(models.Function, { 
    foreignKey: 'function_id', 
    as: 'function',
    onDelete: 'CASCADE'
  });
  
  // A FunctionData belongs to a creator (User)
  FunctionData.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'creator'
  });
  
  // A FunctionData belongs to an updater (User)
  FunctionData.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updater'
  });
};

module.exports = FunctionData;
