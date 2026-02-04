const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const Unit = sequelize.define(
  "Unit",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    directorate_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Directorate",
        key: "id",
      },
    },
  },
  {
    timestamps: true,
    underscored: true,
    tableName: "Unit",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Define associations
Unit.associate = function (models) {
  Unit.belongsTo(models.Directorate, {
    foreignKey: "directorate_id",
    as: "directorate",
  });
  Unit.hasMany(models.Subject, {
    foreignKey: "unit_id",
    as: "subjects",
  });
};

module.exports = Unit;
