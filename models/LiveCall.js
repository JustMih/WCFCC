module.exports = (sequelize, DataTypes) => {
    const LiveCall = sequelize.define("LiveCall", {
      call_start: DataTypes.DATE,
      call_answered: DataTypes.DATE,
      call_end: DataTypes.DATE,
      caller: DataTypes.STRING,
      callee: DataTypes.STRING,
      channel: DataTypes.STRING,
      status: DataTypes.ENUM("calling", "active", "dropped", "ended"),
      linkedid: DataTypes.STRING,
      duration_secs: DataTypes.INTEGER
    }, {
      tableName: "live_calls",
      timestamps: false,
    });
  
    return LiveCall;
  };
  