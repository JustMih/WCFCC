// Test script for Facebook webhook structure
const axios = require('axios');

const BASE_URL = 'http://localhost:5070/api/instagram';

async function testFacebookWebhookStructure() {
  console.log('🧪 Testing Facebook webhook structure...\n');

  try {
    // Test comment with real Facebook structure
    console.log('📝 Testing comment with Facebook webhook structure...');
    const commentResponse = await axios.post(`${BASE_URL}/test-comment`);
    console.log('✅ Comment created:', commentResponse.data);
    console.log('');

    // Test message with real Facebook structure
    console.log('💬 Testing message with Facebook webhook structure...');
    const messageResponse = await axios.post(`${BASE_URL}/test-message`);
    console.log('✅ Message created:', messageResponse.data);
    console.log('');

    // Test batch comments
    console.log('📝 Testing batch comments...');
    const batchCommentsResponse = await axios.post(`${BASE_URL}/test-comments-batch`, { count: 3 });
    console.log('✅ Batch comments created:', batchCommentsResponse.data);
    console.log('');

    // Test batch messages
    console.log('💬 Testing batch messages...');
    const batchMessagesResponse = await axios.post(`${BASE_URL}/test-messages-batch`, { count: 3 });
    console.log('✅ Batch messages created:', batchMessagesResponse.data);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('\nNow check your frontend to see if:');
    console.log('1. Comments appear in the comments section');
    console.log('2. Messages appear in the messages section');
    console.log('3. They are properly distinguished by type');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

testFacebookWebhookStructure();
