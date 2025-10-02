// Simple test script for Instagram endpoints
const axios = require('axios');

const API_BASE_URL = 'http://localhost:5000/api';

async function testInstagramEndpoints() {
  console.log('🧪 Testing Instagram Endpoints...\n');

  try {
    // Test 1: Create a test comment
    console.log('1. Creating test comment...');
    const commentResponse = await axios.post(`${API_BASE_URL}/instagram/test-comment`, {
      text: 'This is a test comment from API',
      from_username: 'test_user',
      from_name: 'Test User'
    });
    console.log('✅ Comment created:', commentResponse.data.message);
    console.log('   Comment ID:', commentResponse.data.comment.id);

    // Test 2: Create a test message
    console.log('\n2. Creating test message...');
    const messageResponse = await axios.post(`${API_BASE_URL}/instagram/test-message`, {
      text: 'This is a test message from API',
      sender_username: 'test_sender'
    });
    console.log('✅ Message created:', messageResponse.data.message);
    console.log('   Message ID:', messageResponse.data.message.id);

    // Test 3: Create batch comments
    console.log('\n3. Creating batch comments...');
    const batchCommentsResponse = await axios.post(`${API_BASE_URL}/instagram/test-comments-batch`, { count: 3 });
    console.log('✅ Batch comments created:', batchCommentsResponse.data.message);

    // Test 4: Create batch messages
    console.log('\n4. Creating batch messages...');
    const batchMessagesResponse = await axios.post(`${API_BASE_URL}/instagram/test-messages-batch`, { count: 3 });
    console.log('✅ Batch messages created:', batchMessagesResponse.data.message);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   - 1 single comment created');
    console.log('   - 1 single message created');
    console.log('   - 3 batch comments created');
    console.log('   - 3 batch messages created');
    console.log('   - Total: 8 test items created');

    console.log('\n🔍 Now check your Instagram management interface at /instagram to see the test data!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testInstagramEndpoints();
