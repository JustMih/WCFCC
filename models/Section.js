const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const Section = sequelize.define('Section', {
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
  tableName: 'Sections',
  timestamps: true,
  underscored: true
});

Section.associate = (models) => {
  // A Section has many Functions
  Section.hasMany(models.Function, { 
    foreignKey: 'section_id', 
    as: 'functions',
    onDelete: 'SET NULL'
  });
  
  // A Section belongs to a creator (User)
  Section.belongsTo(models.User, {
    foreignKey: 'created_by',
    as: 'creator'
  });
  
  // A Section belongs to an updater (User)
  Section.belongsTo(models.User, {
    foreignKey: 'updated_by',
    as: 'updater'
  });

  Section.hasMany(models.Ticket, { foreignKey: 'responsible_unit_id', as: 'tickets' });
};

module.exports = Section;
