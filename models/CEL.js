module.exports = (sequelize, DataTypes) => {
    const CEL = sequelize.define("CEL", {
      eventtime: DataTypes.DATE,
      eventtype: DataTypes.STRING,
      cid_num: DataTypes.STRING,
      peer: DataTypes.STRING,
      channame: DataTypes.STRING,
      uniqueid: DataTypes.STRING,
      linkedid: DataTypes.STRING,
      appname: DataTypes.STRING,
      appdata: DataTypes.STRING,
      context: DataTypes.STRING,
      exten: DataTypes.STRING,
      extra: DataTypes.STRING,
    }, {
      tableName: "cel",
      timestamps: false,
    });
  
    return CEL;
  };
  