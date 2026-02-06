'use strict';

require('dotenv').config(); // Load environment variables

module.exports = {
  up: async (queryInterface) => {
    // Use the default super admin user ID
    const DEFAULT_USER_ID = 'd15a1d7c-da9a-4570-9a29-cd585ef40501';

    // Verify user exists (optional check, won't throw error if not found)
    const [userCheck] = await queryInterface.sequelize.query(
      'SELECT * FROM `Users` WHERE id = :id',
      {
        replacements: { id: DEFAULT_USER_ID }
      }
    );

    if (userCheck.length === 0) {
      console.log('⚠️  Warning: Default user ID not found in Users table. Channels will be created anyway.');
    } else {
      console.log('✅ Default user found, channels will be created with created_by/updated_by');
    }

    const channels = [
      {
        id: '550e8400-e29b-41d4-a716-446655440101',
        name: 'In-System',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440102',
        name: 'Call Center',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440103',
        name: 'Staff Phone Number',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440104',
        name: 'Email',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440105',
        name: 'Walk in',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440106',
        name: 'Letter',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440107',
        name: 'Exhibition',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440108',
        name: 'Social Media',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440109',
        name: 'Suggestion Box',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440110',
        name: 'e-mrejesho',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      }
    ];

    // Check if channels already exist
    for (const channel of channels) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT * FROM `channels` WHERE id = :id',
        {
          replacements: { id: channel.id }
        }
      );

      if (existing.length === 0) {
        await queryInterface.bulkInsert('channels', [channel]);
        console.log(`✔️  Channel created: ${channel.name}`);
      } else {
        console.log(`ℹ️  Channel already exists: ${channel.name}`);
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('channels', null, {});
  }
};
