const cors = require('cors');

// CORS configuration for external API
const externalCorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      ['http://localhost:3000', 'http://127.0.0.1:3000', 
        'http://localhost:5070', 
        'http://127.0.0.1:8005', 
        'http://127.0.0.1:5070',
        'http://localhost:8005',
        'http://10.52.0.19:5070', 'https://demoportal.wcf.go.tz',
        'https://portal.wcf.go.tz', 'https://essp.wcf.go.tz',
      ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
  maxAge: 86400 // 24 hours
};

module.exports = externalCorsOptions; 