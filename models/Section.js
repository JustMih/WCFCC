const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const Section = sequelize.define('Section', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: DataTypes.STRING,
  created_by: DataTypes.UUID,
  created_at: DataTypes.DATE,
  updated_by: DataTypes.UUID,
  updated_at: DataTypes.DATE,
}, {
  tableName: 'Sections',
  timestamps: false,
  underscored: true,
});

Section.associate = (models) => {
  Section.hasMany(models.Function, { foreignKey: 'section_id', as: 'functions' });
};

module.exports = Section;
