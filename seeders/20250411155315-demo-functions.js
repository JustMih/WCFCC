'use strict';

require('dotenv').config(); // Load environment variables

module.exports = {
  up: async (queryInterface) => {
    const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;

    // 1. Check if DEFAULT_USER_ID exists in Users table
    const [userCheck] = await queryInterface.sequelize.query(
      'SELECT id FROM `Users` WHERE id = :id',
      { replacements: { id: DEFAULT_USER_ID } }
    );

    if (userCheck.length === 0) {
      throw new Error(`DEFAULT_USER_ID (${DEFAULT_USER_ID}) does not exist in Users table.`);
    }

    // 2. Verify section IDs exist in Sections table
    const sectionIds = [
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '550e8400-e29b-41d4-a716-446655440003',
      '550e8400-e29b-41d4-a716-446655440004'
    ];

    const [sectionsCheck] = await queryInterface.sequelize.query(
      'SELECT id FROM `Sections` WHERE id IN (:ids)',
      { replacements: { ids: sectionIds } }
    );

    if (sectionsCheck.length !== sectionIds.length) {
      throw new Error('One or more section IDs do not exist in Sections table.');
    }

    // 3. Bulk insert into functions table
    await queryInterface.bulkInsert('functions', [
      // Directorate of Operations
      {
        id: '660e8400-e29b-41d4-a716-446655440001',
        name: 'Claims Administration Section',
        section_id: '550e8400-e29b-41d4-a716-446655440001',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440002',
        name: 'Compliance Section',
        section_id: '550e8400-e29b-41d4-a716-446655440001',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440003',
        name: 'Records Section',
        section_id: '550e8400-e29b-41d4-a716-446655440001',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },

      // Directorate of Assessment Services
      {
        id: '660e8400-e29b-41d4-a716-446655440004',
        name: 'Claims Assessment Section',
        section_id: '550e8400-e29b-41d4-a716-446655440002',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440005',
        name: 'Workplace Risk Assessment Section',
        section_id: '550e8400-e29b-41d4-a716-446655440002',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },

      // Directorate of Finance, Planning and Investment
      {
        id: '660e8400-e29b-41d4-a716-446655440006',
        name: 'Planning and Research',
        section_id: '550e8400-e29b-41d4-a716-446655440003',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440007',
        name: 'Finance Section',
        section_id: '550e8400-e29b-41d4-a716-446655440003',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440008',
        name: 'Investment',
        section_id: '550e8400-e29b-41d4-a716-446655440003',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },

      // Units
      {
        id: '660e8400-e29b-41d4-a716-446655440009',
        name: 'Legal Unit',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440010',
        name: 'ICT Unit',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440011',
        name: 'Actuarial Statistics and Risk Management',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440012',
        name: 'Public Relation Unit',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440013',
        name: 'Procurement Management Unit',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440014',
        name: 'HR/Admin Unit',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440015',
        name: 'Internal Audit Unit',
        section_id: '550e8400-e29b-41d4-a716-446655440004',
        created_by: DEFAULT_USER_ID,
        created_at: new Date(),
        updated_by: DEFAULT_USER_ID,
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('functions', null, {});
  }
};
