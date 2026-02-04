// Test endpoint with detailed error logging
const axios = require('axios');

async function testEndpointWithDebug() {
  try {
    console.log('🧪 Testing endpoint with debug info...');
    
    const response = await axios.post('http://localhost:5070/api/instagram/test-comment', {}, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Success:', response.data);
    
  } catch (error) {
    console.error('❌ Detailed error info:');
    console.error('Message:', error.message);
    console.error('Code:', error.code);
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Data:', error.response?.data);
    console.error('Headers:', error.response?.headers);
    
    if (error.response?.data?.error) {
      console.error('Error details:', error.response.data.error);
    }
  }
}

testEndpointWithDebug();
