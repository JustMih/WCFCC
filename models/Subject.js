const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const Subject = sequelize.define(
  "Subject",
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
    unit_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Unit",
        key: "id",
      },
    },
  },
  {
    timestamps: true,
    underscored: true,
    tableName: "Subject",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Define associations
Subject.associate = function (models) {
  Subject.belongsTo(models.Unit, {
    foreignKey: "unit_id",
    as: "unit",
  });
};

module.exports = Subject;
