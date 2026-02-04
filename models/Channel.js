const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const Channel = sequelize.define('Channel', {
  id: { 
    type: DataTypes.UUID, 
    defaultValue: DataTypes.UUIDV4, 
    primaryKey: true 
  },
  name: { 
    type: DataTypes.STRING(100), 
    allowNull: false 
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
  tableName: 'channels',
  timestamps: true,
  underscored: true
});

Channel.name = 'Channel';

Channel.associate = (models) => {
  // A Channel belongs to a creator (User)
  Channel.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'creator'
  });
  
  // A Channel belongs to an updater (User)
  Channel.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updater'
  });
  
};

module.exports = Channel;
