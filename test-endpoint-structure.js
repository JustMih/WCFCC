// Test endpoint structure without database
const axios = require('axios');

async function testEndpointStructure() {
  try {
    console.log('🧪 Testing endpoint structure...');
    
    // Test with a simple GET request to see if the route exists
    console.log('📝 Testing GET /test-comment (should return 404 or 405)...');
    try {
      const getResponse = await axios.get('http://localhost:5070/api/instagram/test-comment');
      console.log('Unexpected GET response:', getResponse.status);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✅ Route not found for GET (expected)');
      } else if (error.response?.status === 405) {
        console.log('✅ Method not allowed for GET (expected)');
      } else {
        console.log('❌ Unexpected error:', error.response?.status);
      }
    }
    
    // Test POST with minimal data
    console.log('📝 Testing POST /test-comment with minimal data...');
    const postResponse = await axios.post('http://localhost:5070/api/instagram/test-comment', {});
    console.log('✅ POST response:', postResponse.data);
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Full error:', error.response.data);
    }
  }
}

testEndpointStructure();
