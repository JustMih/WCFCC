const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const FunctionModel = sequelize.define('Function', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  name: { 
    type: DataTypes.STRING(100), 
    allowNull: false 
  },
  section_id: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { 
      model: 'Sections', 
      key: 'id' 
    },
    onDelete: 'SET NULL'
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
  tableName: 'functions',
  timestamps: true,
  underscored: true
});

FunctionModel.associate = (models) => {
  // A Function belongs to a Section
  FunctionModel.belongsTo(models.Section, { 
    foreignKey: 'section_id', 
    as: 'section',
    onDelete: 'SET NULL'
  });
  
  // A Function has many FunctionData
  FunctionModel.hasMany(models.FunctionData, { 
    foreignKey: 'function_id', 
    as: 'functionData',
    onDelete: 'CASCADE'
  });
  
  // A Function has many Tickets
  FunctionModel.hasMany(models.Ticket, { 
    foreignKey: 'responsible_unit_id', 
    as: 'tickets',
    onDelete: 'SET NULL'
  });
  
  // A Function belongs to a creator (User)
  FunctionModel.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'creator'
  });
  
  // A Function belongs to an updater (User)
  FunctionModel.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updater'
  });
};

module.exports = FunctionModel;
