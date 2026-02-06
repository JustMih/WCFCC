// Test the test endpoints directly
const axios = require('axios');

async function testDirectEndpoints() {
  try {
    console.log('🧪 Testing test endpoints directly...');
    
    // Test the test-comment endpoint
    console.log('📝 Testing /test-comment endpoint...');
    const commentResponse = await axios.post('http://localhost:5070/api/instagram/test-comment');
    console.log('✅ Test comment response:', commentResponse.data);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Full error:', error.response.data);
    }
  }
}

testDirectEndpoints();
