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

    // 2. Verify function IDs exist in functions table
    const functionIds = [
      '660e8400-e29b-41d4-a716-446655440001',
      '660e8400-e29b-41d4-a716-446655440002',
      '660e8400-e29b-41d4-a716-446655440003',
      '660e8400-e29b-41d4-a716-446655440004',
      '660e8400-e29b-41d4-a716-446655440005',
      '660e8400-e29b-41d4-a716-446655440006',
      '660e8400-e29b-41d4-a716-446655440007',
      '660e8400-e29b-41d4-a716-446655440008',
      '660e8400-e29b-41d4-a716-446655440009',
      '660e8400-e29b-41d4-a716-446655440010',
      '660e8400-e29b-41d4-a716-446655440011',
      '660e8400-e29b-41d4-a716-446655440012',
      '660e8400-e29b-41d4-a716-446655440013',
      '660e8400-e29b-41d4-a716-446655440014',
      '660e8400-e29b-41d4-a716-446655440015'
    ];

    const [functionsCheck] = await queryInterface.sequelize.query(
      'SELECT id FROM `functions` WHERE id IN (:ids)',
      { replacements: { ids: functionIds } }
    );

    if (functionsCheck.length !== functionIds.length) {
      throw new Error('One or more function IDs do not exist in functions table.');
    }

    // 3. Bulk insert full function_data
    await queryInterface.bulkInsert('function_data', [
      { id: 'aa6e4251-5fa9-4c80-8cec-f9558bd5aa0a', name: 'Pension Payment', function_id: '660e8400-e29b-41d4-a716-446655440001', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'c530d96c-f715-4ad8-9c9f-1265d7603570', name: 'Compensation Payment', function_id: '660e8400-e29b-41d4-a716-446655440001', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '6016c1c0-7832-49ec-a129-4825df540606', name: 'Approval of Medical Aid', function_id: '660e8400-e29b-41d4-a716-446655440001', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'f1599d1f-9515-4241-949d-44bcf69523c6', name: 'Formal Hearing', function_id: '660e8400-e29b-41d4-a716-446655440001', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '9998439c-2dbc-4fd6-a032-07e06e7a8ce4', name: 'HCP & HSP Matters', function_id: '660e8400-e29b-41d4-a716-446655440001', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: 'f1599d1f-9515-4241-949d-44bcf69523ca', name: 'Contribution', function_id: '660e8400-e29b-41d4-a716-446655440002', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '9998439c-2dbc-4fd6-a032-07e06e7a8ced', name: 'Registration', function_id: '660e8400-e29b-41d4-a716-446655440002', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '9998439c-2dbc-4fd6-a032-07e06e7a8ce2', name: 'Annual Return', function_id: '660e8400-e29b-41d4-a716-446655440002', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '9998439c-2dbc-4fd6-a032-07e06e7a8ce1', name: 'Inspection', function_id: '660e8400-e29b-41d4-a716-446655440002', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '9998439c-2dbc-4fd6-a032-07e06e7a8cea', name: 'Generation of Control Number', function_id: '660e8400-e29b-41d4-a716-446655440002', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '9998439c-2dbc-4fd6-a032-07e06e7a8cec', name: 'Add/Remove Employee on Payroll', function_id: '660e8400-e29b-41d4-a716-446655440002', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '8f9d02a4-b62a-4aeb-97cf-56a46e3b6603', name: 'Correspondences', function_id: '660e8400-e29b-41d4-a716-446655440003', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: 'b5483c58-6915-49e3-92cc-d6a07bc9390f', name: 'Medical Advice Panel (MAP)', function_id: '660e8400-e29b-41d4-a716-446655440004', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'bc43ec3f-d785-4a93-b7a1-70d80d44c89b', name: 'Impairment Assessment', function_id: '660e8400-e29b-41d4-a716-446655440004', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'b0091d2a-3f79-4e79-8e5b-8fc301857e3b', name: 'Assessment Matters', function_id: '660e8400-e29b-41d4-a716-446655440004', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'bc43ec3f-d785-4a93-b7a1-70d80d44c89a', name: 'HCP & HSP Matters', function_id: '660e8400-e29b-41d4-a716-446655440004', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '7ef33e1f-9485-4d38-8d78-58d90e10df3f', name: 'Workplace Risk Assessment Matters', function_id: '660e8400-e29b-41d4-a716-446655440005', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: 'fb8c9f9a-17ec-4fd6-a214-b1f69183f937', name: 'Planning and Research Matters', function_id: '660e8400-e29b-41d4-a716-446655440006', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '2650de56-7294-4483-85f2-c79f770b7cb5', name: 'Payments', function_id: '660e8400-e29b-41d4-a716-446655440007', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '6f4f72df-0b0e-4ba2-b233-97c4b29dfbb3', name: 'Investment Matters', function_id: '660e8400-e29b-41d4-a716-446655440008', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '1af12ab6-14ee-4aa6-9b8b-0f8bb2ad60bc', name: 'Legal Matters', function_id: '660e8400-e29b-41d4-a716-446655440009', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'e3cdb476-6459-4e8c-8eb0-ff1e364b37b0', name: 'Review Decision', function_id: '660e8400-e29b-41d4-a716-446655440009', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '1037d524-d7a3-4f15-b470-0380bb50f7c3', name: 'ICT Technical Support', function_id: '660e8400-e29b-41d4-a716-446655440010', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '4d49728c-367c-4b12-9352-42d53d858f52', name: 'Actuarial Services and Risk Management Matters', function_id: '660e8400-e29b-41d4-a716-446655440011', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '17226401-7543-49fd-949c-552f9c6d1866', name: 'Statistics Matters', function_id: '660e8400-e29b-41d4-a716-446655440011', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: 'd1a44228-05a2-4c4a-a8c6-3a0aa33a5ab4', name: 'Awareness', function_id: '660e8400-e29b-41d4-a716-446655440012', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'e1cd3376-e5e4-40f2-9f6a-9db741245eb5', name: 'Donation/ Sponsorship Matters', function_id: '660e8400-e29b-41d4-a716-446655440012', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'f065982f-fbab-4e7f-a0a0-d3b4e17907fd', name: 'Exhibition Matters', function_id: '660e8400-e29b-41d4-a716-446655440012', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'f887ef83-52c4-49f6-b1a3-2743ae34f35b', name: 'Advertisement Matters', function_id: '660e8400-e29b-41d4-a716-446655440012', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: 'c41e8752-07c1-4b3b-a58b-d0cbfe3f1cc0', name: 'Procurement Matters', function_id: '660e8400-e29b-41d4-a716-446655440013', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: '2858ff9b-0c44-4c8d-80df-0f40187e1309', name: 'Recruitment Matters', function_id: '660e8400-e29b-41d4-a716-446655440014', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '56f92083-d168-4aa2-a4a9-3d58e59b55e2', name: 'Human Resource Matters', function_id: '660e8400-e29b-41d4-a716-446655440014', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: 'd663c582-d7e7-4b80-b5df-64879fa08d62', name: 'Leave Management & Intern Attachments', function_id: '660e8400-e29b-41d4-a716-446655440014', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },
      { id: '56f92083-d168-4aa2-a4a9-3d58e59b55e3', name: 'DG\'s Office Matters', function_id: '660e8400-e29b-41d4-a716-446655440014', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() },

      { id: 'f0015b29-bab2-4b9b-9d10-380f88b6b03e', name: 'Audit Matters', function_id: '660e8400-e29b-41d4-a716-446655440015', created_by: DEFAULT_USER_ID, created_at: new Date(), updated_by: DEFAULT_USER_ID, updated_at: new Date() }
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.bulkDelete('function_data', null, {});
  }
};
