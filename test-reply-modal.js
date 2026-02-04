// Test script to create test data and verify reply functionality
const axios = require('axios');

async function testReplyModal() {
  try {
    console.log('🧪 Testing Reply Modal Functionality...\n');

    // Create test comment
    console.log('📝 Creating test comment...');
    const commentResponse = await axios.post('http://localhost:5070/api/instagram/test-comment');
    const comment = commentResponse.data.comment;
    console.log('✅ Test comment created:', comment.id);
    console.log('📄 Comment text:', comment.text);

    // Create test message
    console.log('\n📝 Creating test message...');
    const messageResponse = await axios.post('http://localhost:5070/api/instagram/test-message');
    const message = messageResponse.data.message;
    console.log('✅ Test message created:', message.id);
    console.log('📄 Message text:', message.text);

    console.log('\n🎉 Test data created successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Open your frontend application');
    console.log('2. Navigate to the Instagram Management page');
    console.log('3. You should see the test comment and message');
    console.log('4. Click the "Reply" button on any item');
    console.log('5. A modal should open with a text area');
    console.log('6. Type your reply and click "Send Reply"');
    
    console.log('\n🔍 If the modal doesn\'t open:');
    console.log('- Check browser console for errors');
    console.log('- Make sure the frontend is running on the correct port');
    console.log('- Verify the API connection is working');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testReplyModal();
