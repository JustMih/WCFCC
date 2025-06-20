const AsteriskManager = require('asterisk-manager');
const mysql = require('mysql2/promise');
let ioInstance = null;

// Setup AMI
const ami = new AsteriskManager(5038, '127.0.0.1', 'admin', '@Ttcl123', true);
ami.keepConnected();

// Setup MySQL pool
const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk'
});

// Caches
const queueCache = {};

// Setup Socket.IO
const setupSocket = (io) => {
  ioInstance = io;
  global._io = io;

  io.on('connection', (socket) => {
    console.log('📡 Client connected:', socket.id);

    socket.emit('live_queue_update', Object.values(queueCache));

    socket.on('disconnect', () => {
      console.log('📴 Client disconnected:', socket.id);
    });
  });
};

// Emit queue update
const emitQueue = () => {
  if (ioInstance) {
    ioInstance.emit('live_queue_update', Object.values(queueCache));
  }
};

// AMI Event Handlers
ami.on('managerevent', async (event) => {
  if (event.Event === 'QueueCallerJoin') {
    const id = event.Uniqueid;
    queueCache[id] = {
      caller: event.CallerIDNum || 'unknown',
      queue: event.Queue,
      position: event.Position || '-',
      joinedAt: new Date()
    };

    // Insert into queue_log table
    try {
      await db.execute(`
        INSERT INTO queue_log (time, callid, queuename, agent, event, data1, data2, data3, data4, data5)
        VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL)
      `, [
        new Date(),
        id,
        event.Queue,
        'QueueCallerJoin',
        event.CallerIDNum || '',
        event.Position || ''
      ]);
    } catch (err) {
      console.error('❌ Error inserting into queue_log:', err);
    }

    emitQueue();
  }

  if (event.Event === 'QueueCallerLeave') {
    const id = event.Uniqueid;
    delete queueCache[id];

    emitQueue();
  }
});

// Getters
const getQueueCache = () => Object.values(queueCache);

// Export only real-time functions
module.exports = {
  setupSocket,
  getQueueCache
};
