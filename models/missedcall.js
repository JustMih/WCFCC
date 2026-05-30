const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const { patchMissedCallCreate } = require("../utils/missedCallInsertSafe");

const MissedCall = sequelize.define(
  "MissedCall",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    caller: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    agentId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "called_back", "ignored"),
      defaultValue: "pending",
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: "MissedCalls",
  }
);

patchMissedCallCreate(MissedCall);

MissedCall.associate = function (models) {
  MissedCall.belongsTo(models.User, {
    foreignKey: "agentId",
    targetKey: "extension",
    as: "agent",
  });
};

module.exports = MissedCall;
