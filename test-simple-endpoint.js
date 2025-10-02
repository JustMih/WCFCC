// Simple test to check if server is responding
const axios = require('axios');

async function testServerConnection() {
  try {
    console.log('🔍 Testing server connection...');
    
    // Test a simple GET endpoint first
    const response = await axios.get('http://localhost:5070/api/instagram/comments');
    console.log('✅ Server is responding:', response.status);
    
  } catch (error) {
    console.error('❌ Server test failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testServerConnection();
