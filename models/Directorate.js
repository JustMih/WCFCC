const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const Directorate = sequelize.define(
  "Directorate",
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
  },
  {
    timestamps: true,
    underscored: true,
    tableName: "Directorate",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Define associations
Directorate.associate = function (models) {
  Directorate.hasMany(models.Unit, {
    foreignKey: "directorate_id",
    as: "units",
  });
};

module.exports = Directorate;
