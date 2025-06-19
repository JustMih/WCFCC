// module.exports = (sequelize, DataTypes) => {
//     const LiveCall = sequelize.define("LiveCall", {
//       call_start: DataTypes.DATE,
//       call_answered: DataTypes.DATE,
//       call_end: DataTypes.DATE,
//       caller: DataTypes.STRING,
//       callee: DataTypes.STRING,
//       channel: DataTypes.STRING,
//       status: DataTypes.ENUM("calling", "active", "dropped", "ended"),
//       linkedid: DataTypes.STRING,
//       duration_secs: DataTypes.INTEGER
//     }, {
//       tableName: "live_calls",
//       timestamps: false,
//     });
  
//     return LiveCall;
//   };
// models/LiveCall.js
module.exports = (sequelize, DataTypes) => {
  const LiveCall = sequelize.define(
    "LiveCall",
    {
      linkedid: {
        type: DataTypes.STRING,
        unique: true, // required for upsert
      },
      call_start: DataTypes.DATE,
      call_answered: DataTypes.DATE,
      call_end: DataTypes.DATE,
      caller: DataTypes.STRING,
      callee: DataTypes.STRING,
      channel: DataTypes.STRING,
      status: DataTypes.ENUM("calling", "active", "dropped", "ended"),
      duration_secs: DataTypes.INTEGER,
      queue_entry_time: DataTypes.DATE,
      estimated_wait_time: DataTypes.INTEGER,
      voicemail_path: DataTypes.STRING,
      agent_callback: DataTypes.BOOLEAN,
    },
    {
      tableName: "live_calls",
      timestamps: false,
    }
  );

  return LiveCall;
};

  