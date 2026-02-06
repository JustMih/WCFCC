// Test without database - just check if the endpoint responds
const express = require('express');
const app = express();

// Simple test endpoint
app.post('/test-simple', (req, res) => {
  console.log('✅ Simple endpoint called');
  res.json({ success: true, message: 'Simple endpoint works' });
});

const PORT = 5071;
app.listen(PORT, () => {
  console.log(`🧪 Test server running on port ${PORT}`);
  
  // Test the endpoint
  const axios = require('axios');
  axios.post(`http://localhost:${PORT}/test-simple`)
    .then(response => {
      console.log('✅ Test successful:', response.data);
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    });
});
