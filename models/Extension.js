const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./user.js");

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
      references: {
        model: User,
        key: "id",
      },
      unique: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // Default is inactive
    },
  },
  { timestamps: true }
);

User.hasOne(Extension, { foreignKey: "userId", onDelete: "CASCADE" });
Extension.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });

module.exports = Extension;
