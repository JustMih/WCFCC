// Test database connection
const sequelize = require('./config/mysql_connection');
const InstagramComment = require('./models/instagram_comment');

async function testDatabaseConnection() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    // Test if we can query the InstagramComment table
    console.log('🔍 Testing InstagramComment model...');
    const count = await InstagramComment.count();
    console.log('✅ InstagramComment table accessible, count:', count);
    
    // Test creating a simple record
    console.log('🔍 Testing record creation...');
    const testComment = await InstagramComment.create({
      id: Date.now(),
      media_id: Date.now(),
      text: 'Test comment for database connection',
      from_id: Date.now(),
      from_username: 'test_user',
      raw_payload: { test: true },
      unread: true,
      read: false,
      replied: false
    });
    
    console.log('✅ Test comment created successfully:', testComment.id);
    
    // Clean up
    await testComment.destroy();
    console.log('✅ Test comment cleaned up');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

testDatabaseConnection();
