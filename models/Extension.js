const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./User.js");

const Extension = sequelize.define(
  "Extension",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    id_alias: { type: DataTypes.INTEGER, allowNull: false },
    transport: { type: DataTypes.STRING, allowNull: false },
    aors: { type: DataTypes.INTEGER, allowNull: false },
    auth: { type: DataTypes.INTEGER, allowNull: false },
    context: { type: DataTypes.STRING, allowNull: false },
    disallow: { type: DataTypes.STRING, allowNull: false },
    allow: { type: DataTypes.STRING, allowNull: false },
    dtmf_mode: { type: DataTypes.STRING, allowNull: false },
    callerid: { type: DataTypes.INTEGER, allowNull: true },
    direct_media: { type: DataTypes.STRING, allowNull: false },
    force_rport: { type: DataTypes.STRING, allowNull: false },
    rewrite_contact: { type: DataTypes.STRING, allowNull: false },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "userId",
      unique: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // Default is inactive
    },
  },
  {
    timestamps: true,
    underscored: true,
    tableName: "Extensions",
    freezeTableName: true,
  }
);

// Define associations - disable constraint creation since it's managed by migrations
// The foreign key constraint already exists from migration, so we just define the relationship
Extension.belongsTo(User, {
  foreignKey: "userId",
  targetKey: "id",
  onDelete: "CASCADE",
  constraints: false, // Don't create constraint during sync - it already exists from migration
});

module.exports = Extension;
