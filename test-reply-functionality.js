// Test the reply functionality
const axios = require('axios');

const BASE_URL = 'http://localhost:5070/api/instagram-management';

async function testReplyFunctionality() {
  try {
    console.log('🧪 Testing Instagram reply functionality...\n');

    // First, create a test comment
    console.log('📝 Creating test comment...');
    const commentResponse = await axios.post('http://localhost:5070/api/instagram/test-comment');
    const comment = commentResponse.data.comment;
    console.log('✅ Test comment created:', comment.id);

    // Test replying to the comment
    console.log('💬 Testing reply to comment...');
    const replyText = 'This is a test reply to the comment';
    
    try {
      const replyResponse = await axios.post(`${BASE_URL}/comments/${comment.id}/reply`, {
        reply: replyText
      }, {
        headers: {
          'Authorization': 'Bearer test-token', // You might need a real token
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Reply to comment successful:', replyResponse.data);
    } catch (replyError) {
      console.log('⚠️ Reply failed (might need authentication):', replyError.response?.status);
      console.log('Error details:', replyError.response?.data);
    }

    // Create a test message
    console.log('\n📝 Creating test message...');
    const messageResponse = await axios.post('http://localhost:5070/api/instagram/test-message');
    const message = messageResponse.data.message;
    console.log('✅ Test message created:', message.id);

    // Test replying to the message
    console.log('💬 Testing reply to message...');
    const messageReplyText = 'This is a test reply to the message';
    
    try {
      const messageReplyResponse = await axios.post(`${BASE_URL}/messages/${message.id}/reply`, {
        reply: messageReplyText
      }, {
        headers: {
          'Authorization': 'Bearer test-token', // You might need a real token
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Reply to message successful:', messageReplyResponse.data);
    } catch (replyError) {
      console.log('⚠️ Reply failed (might need authentication):', replyError.response?.status);
      console.log('Error details:', replyError.response?.data);
    }

    console.log('\n🎉 Reply functionality test completed!');
    console.log('\nTo test the full functionality:');
    console.log('1. Go to your frontend Instagram management page');
    console.log('2. You should see the test comment and message');
    console.log('3. Click the "Reply" button on any item');
    console.log('4. Type your reply and submit');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testReplyFunctionality();
