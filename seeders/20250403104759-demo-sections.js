'use strict';

require('dotenv').config(); // Load environment variables

module.exports = {
  up: async (queryInterface) => {
    const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;

    // Ensure DEFAULT_USER_ID exists
    const [userCheck] = await queryInterface.sequelize.query(
      'SELECT * FROM `Users` WHERE id = :id',
      {
        replacements: { id: DEFAULT_USER_ID }
      }
    );

    if (userCheck.length === 0) {
      throw new Error(`DEFAULT_USER_ID (${DEFAULT_USER_ID}) does not exist in Users table.`);
    }

    const sections = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Directorate of Operations',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Directorate of Assessment Services',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Directorate of Finance, Planning and Investment',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'Legal Unit',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440005',
        name: 'ICT Unit',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440006',
        name: 'Actuarial Statistics and Risk Management',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440007',
          name: 'Public Relation Unit',
          created_by: DEFAULT_USER_ID,
          created_at: new Date(),
          updated_by: DEFAULT_USER_ID,
          updated_at: new Date()
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440008',
          name: 'Procurement Management Unit',
          created_by: DEFAULT_USER_ID,
          created_at: new Date(),
          updated_by: DEFAULT_USER_ID,
          updated_at: new Date()
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440009',
          name: 'Human Resource Management and Attachment Unit',
          created_by: DEFAULT_USER_ID,
          created_at: new Date(),
          updated_by: DEFAULT_USER_ID,
          updated_at: new Date()
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440009',
          name: 'Internal Audit Unit',
          created_by: DEFAULT_USER_ID,
          created_at: new Date(),
          updated_by: DEFAULT_USER_ID,
          updated_at: new Date()
        },
    ];

    // Check if sections already exist
    for (const section of sections) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT * FROM `Sections` WHERE id = :id',
        {
          replacements: { id: section.id }
        }
      );

      if (existing.length === 0) {
        await queryInterface.bulkInsert('Sections', [section]);
        console.log(`✔️  Section created: ${section.name}`);
      } else {
        console.log(`ℹ️  Section already exists: ${section.name}`);
      }
    }
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('Sections', null, {});
  }
};
