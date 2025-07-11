'use strict';

const { v4: uuidv4 } = require('uuid');
require('dotenv').config(); // Load environment variables

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;

    // 1. Verify DEFAULT_USER_ID exists in Users table
    const [userCheck] = await queryInterface.sequelize.query(
      'SELECT id FROM `Users` WHERE id = :id',
      { replacements: { id: DEFAULT_USER_ID } }
    );

    if (userCheck.length === 0) {
      throw new Error(`DEFAULT_USER_ID (${DEFAULT_USER_ID}) does not exist in Users table.`);
    }

    // 2. Prepare ticket records
    const tickets = [
      {
        id: uuidv4(),
        first_name: 'Aisha',
        middle_name: 'Hassan',
        last_name: 'Mohammed',
        phone_number: '0712000001',
        nida_number: '1990123456780001',
        requester: 'Aisha Mohammed',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Huduma ya Fidia',
        category: 'Complaint',
        sub_section: 'Fidia',
        section: 'Madai',
        channel: 'Phone',
        description: 'Madai ya fidia ya ajali kazini.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440001', // Claims Administration Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Jonas',
        middle_name: 'Mwita',
        last_name: 'Kipemba',
        phone_number: '0712000002',
        nida_number: '1990123456780002',
        requester: 'Jonas Mwita',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Madai ya Mafao',
        category: 'Complaint',
        sub_section: 'Mafao',
        section: 'Madai',
        channel: 'Phone',
        description: 'Malipo ya mafao kuchelewa.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440001', // Claims Administration Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Fatuma',
        middle_name: 'Salma',
        last_name: 'Said',
        phone_number: '0712000003',
        nida_number: '1990123456780003',
        requester: 'Fatuma Said',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Usumbufu',
        category: 'Complaint',
        sub_section: 'Usumbufu',
        section: 'Huduma',
        channel: 'Phone',
        description: 'Nimepata usumbufu wakati wa huduma.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440002', // Compliance Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Michael',
        middle_name: 'George',
        last_name: 'Edward',
        phone_number: '0712000004',
        nida_number: '1990123456780004',
        requester: 'Michael Edward',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Fidia ya Ulemavu',
        category: 'Complaint',
        sub_section: 'Ulemavu',
        section: 'Madai',
        channel: 'Phone',
        description: 'Sijapata fidia ya ulemavu kazini.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440004', // Claims Assessment Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Zawadi',
        middle_name: 'Juma',
        last_name: 'Mkinga',
        phone_number: '0712000005',
        nida_number: '1990123456780005',
        requester: 'Zawadi Juma',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Madai ya Malipo',
        category: 'Complaint',
        sub_section: 'Malipo',
        section: 'Madai',
        channel: 'Phone',
        description: 'Nimechelewa kulipwa mafao.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440007', // Finance Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'John',
        middle_name: 'Paul',
        last_name: 'Mushi',
        phone_number: '0712000006',
        nida_number: '1990123456780006',
        requester: 'John Mushi',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Huduma mbovu',
        category: 'Complaint',
        sub_section: 'Huduma',
        section: 'Madai',
        channel: 'Phone',
        description: 'Sikuridhika na huduma ya afisa wa TTCL.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440002', // Compliance Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Neema',
        middle_name: 'Rose',
        last_name: 'Kimario',
        phone_number: '0712000007',
        nida_number: '1990123456780007',
        requester: 'Neema Rose',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Ucheleweshaji',
        category: 'Complaint',
        sub_section: 'Ucheleweshaji',
        section: 'Madai',
        channel: 'Phone',
        description: 'Ucheleweshaji wa nyaraka za madai.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440003', // Records Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Ahmed',
        middle_name: 'Issa',
        last_name: 'Bakari',
        phone_number: '0712000008',
        nida_number: '1990123456780008',
        requester: 'Ahmed Bakari',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Taarifa batili',
        category: 'Complaint',
        sub_section: 'Taarifa',
        section: 'Madai',
        channel: 'Phone',
        description: 'Nilipewa taarifa zisizo sahihi.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440002', // Compliance Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Lucy',
        middle_name: 'Agnes',
        last_name: 'Maro',
        phone_number: '0712000009',
        nida_number: '1990123456780009',
        requester: 'Lucy Maro',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Fomu ya madai',
        category: 'Complaint',
        sub_section: 'Fomu',
        section: 'Madai',
        channel: 'Phone',
        description: 'Sikupewa fomu ya madai kwa wakati.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440001', // Claims Administration Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        first_name: 'Kelvin',
        middle_name: 'Joel',
        last_name: 'Ndiho',
        phone_number: '0712000010',
        nida_number: '1990123456780010',
        requester: 'Kelvin Ndiho',
        institution: 'TTCL',
        region: 'Dar es Salaam',
        district: 'Ilala',
        subject: 'Huduma isiyokamilika',
        category: 'Complaint',
        sub_section: 'Huduma',
        section: 'Madai',
        channel: 'Phone',
        description: 'Madai yangu hayajakamilishwa hadi sasa.',
        status: 'Open',
        request_registered_date: now,
        responsible_unit_id: '660e8400-e29b-41d4-a716-446655440001', // Claims Administration Section
        created_by: DEFAULT_USER_ID,
        created_at: now,
        updated_at: now
      }
    ];

    // 3. Bulk insert tickets
    await queryInterface.bulkInsert('Tickets', tickets);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Tickets', null, {});
  }
};
