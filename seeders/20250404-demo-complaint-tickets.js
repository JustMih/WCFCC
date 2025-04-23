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
        subject: 'Huduma ya Fidia',
        category: 'Complaint',
        description: 'Madai ya fidia ya ajali kazini.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Madai ya Mafao',
        category: 'Complaint',
        description: 'Malipo ya mafao kuchelewa.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Usumbufu',
        category: 'Complaint',
        description: 'Nimepata usumbufu wakati wa huduma.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Fidia ya Ulemavu',
        category: 'Complaint',
        description: 'Sijapata fidia ya ulemavu kazini.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Madai ya Malipo',
        category: 'Complaint',
        description: 'Nimechelewa kulipwa mafao.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Huduma mbovu',
        category: 'Complaint',
        description: 'Sikuridhika na huduma ya afisa wa TTCL.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Ucheleweshaji',
        category: 'Complaint',
        description: 'Ucheleweshaji wa nyaraka za madai.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Taarifa batili',
        category: 'Complaint',
        description: 'Nilipewa taarifa zisizo sahihi.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Fomu ya madai',
        category: 'Complaint',
        description: 'Sikupewa fomu ya madai kwa wakati.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
        subject: 'Huduma isiyokamilika',
        category: 'Complaint',
        description: 'Madai yangu hayajakamilishwa hadi sasa.',
        status: 'Open',
        assigned_to_role: 'Coordinator',
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
