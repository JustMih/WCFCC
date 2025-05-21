const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const DemoMac = sequelize.define("demo_mac", {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    first_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    middle_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    last_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    phone_number: {
        type: DataTypes.STRING,
        allowNull: false
    },
    nida_number: {
        type: DataTypes.STRING,
        allowNull: true
    },
    institution: {
        type: DataTypes.STRING,
        allowNull: true
    },
    region: {
        type: DataTypes.STRING,
        allowNull: false
    },
    district: {
        type: DataTypes.STRING,
        allowNull: false
    }
    }, { timestamps: true, tableName:'demo_mac'
});

module.exports = DemoMac
