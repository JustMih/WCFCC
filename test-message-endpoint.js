// Test the message endpoint
const axios = require('axios');

async function testMessageEndpoint() {
  try {
    console.log('🧪 Testing message endpoint...');
    
    const response = await axios.post('http://localhost:5070/api/instagram/test-message');
    console.log('✅ Message endpoint success:', response.data);
    
  } catch (error) {
    console.error('❌ Message endpoint failed:', error.response?.data || error.message);
  }
}

testMessageEndpoint();
