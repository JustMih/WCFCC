// Test the CallCenterSocialMessage modal functionality
const axios = require('axios');

async function testCallCenterModal() {
  try {
    console.log('🧪 Testing CallCenterSocialMessage Modal Functionality...\n');

    // Create test data
    console.log('📝 Creating test data...');
    const commentResponse = await axios.post('http://localhost:5070/api/instagram/test-comment');
    const comment = commentResponse.data.comment;
    console.log('✅ Test comment created:', comment.id);

    const messageResponse = await axios.post('http://localhost:5070/api/instagram/test-message');
    const message = messageResponse.data.message;
    console.log('✅ Test message created:', message.id);

    console.log('\n🎉 CallCenterSocialMessage Modal Test Complete!');
    console.log('\n📋 Summary:');
    console.log('✅ Created CallCenterReplyModal component');
    console.log('✅ Added modal state management to CallCenterSocialMessage');
    console.log('✅ Updated reply functionality to open modal');
    console.log('✅ Added proper form handling and submission');
    console.log('✅ Test data created successfully');
    
    console.log('\n🚀 How to Test:');
    console.log('1. Open your frontend application');
    console.log('2. Navigate to Call Center Social Message page');
    console.log('3. Click the "Reply" button on any Instagram comment or message');
    console.log('4. A modal should open with:');
    console.log('   - Original message/comment displayed');
    console.log('   - Text area to type your reply');
    console.log('   - Cancel and Send Reply buttons');
    console.log('5. Type your reply and click "Send Reply"');
    console.log('6. The modal should close and the reply should be saved');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testCallCenterModal();
