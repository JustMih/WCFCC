const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const pjsip_aors = require("./pjsip_aors");
const pjsip_auths = require("./pjsip_auths");

const Pjsip_Endpoints = sequelize.define(
  "pjsip_endpoints",
    {
        id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            primaryKey: true,
        },
        transport: { type: DataTypes.STRING, allowNull: false },
        aors: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: pjsip_aors, key: "id" },
            unique: true,
        },
        auth: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: pjsip_auths, key: "id" },
            unique: true,
        },
        context: { type: DataTypes.STRING, allowNull: false },
        disallow: { type: DataTypes.STRING, allowNull: false },
        allow: { type: DataTypes.STRING, allowNull: false },
        direct_media: { type: DataTypes.STRING, allowNull: false },
        outbound_proxy: { type: DataTypes.STRING, allowNull: true },
        from_domain: { type: DataTypes.STRING, allowNull: true },
        qualify_frequency: { type: DataTypes.INTEGER, allowNull: false },
        media_address: { type: DataTypes.STRING, allowNull: true },
        dtmf_mode: { type: DataTypes.STRING, allowNull: false },
        force_rport: { type: DataTypes.STRING, allowNull: false },
        comedia: { type: DataTypes.STRING, allowNull: false },
        rtp_symmetric: { type: DataTypes.STRING, allowNull: false },
    },
  { timestamps: true }
);

pjsip_aors.hasOne(Pjsip_Endpoints, {
  foreignKey: "aors",
  onDelete: "CASCADE",
});
Pjsip_Endpoints.belongsTo(pjsip_aors, {
  foreignKey: "aors",
  onDelete: "CASCADE",
});

pjsip_auths.hasOne(Pjsip_Endpoints, {
  foreignKey: "auth",
  onDelete: "CASCADE",
});
Pjsip_Endpoints.belongsTo(pjsip_auths, {
  foreignKey: "auth",
  onDelete: "CASCADE",
});

module.exports = Pjsip_Endpoints;
