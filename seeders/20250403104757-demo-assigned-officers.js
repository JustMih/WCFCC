'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Fetch 5 attendees from users
    const [attendees] = await queryInterface.sequelize.query(`
      SELECT id FROM \`Users\` WHERE role = 'attendee' LIMIT 5
    `); // Changed quotes to backticks for MariaDB

    if (attendees.length < 5) {
      throw new Error("You need at least 5 users with role 'attendee' in users table.");
    }

    const officers = [
      {
        nida_number: '1990234567890001',
        phone_number: '0755000111',
        employer_id: 'EMP001',
        first_name: 'Aisha',
        middle_name: 'Abdallah',
        last_name: 'Salum',
        assigned_to_id: attendees[0].id,
      },
      {
        nida_number: '1990234567890002',
        phone_number: '0755000222',
        employer_id: 'EMP002',
        first_name: 'Jonas',
        middle_name: 'Michael',
        last_name: 'Kamau',
        assigned_to_id: attendees[1].id,
      },
      {
        nida_number: '1990234567890003',
        phone_number: '0755000333',
        employer_id: 'EMP003',
        first_name: 'Zuwena',
        middle_name: 'Joseph',
        last_name: 'Mwakyembe',
        assigned_to_id: attendees[2].id,
      },
      {
        nida_number: '1990234567890004',
        phone_number: '0755000444',
        employer_id: 'EMP004',
        first_name: 'Faraji',
        middle_name: 'Lukas',
        last_name: 'Mussa',
        assigned_to_id: attendees[3].id,
      },
      {
        nida_number: '1990234567890005',
        phone_number: '0755000555',
        employer_id: 'EMP005',
        first_name: 'Agatha',
        middle_name: 'Neema',
        last_name: 'Ngonyani',
        assigned_to_id: attendees[4].id,
      }
    ];

    for (const officer of officers) {
      const [existing] = await queryInterface.sequelize.query(
        `SELECT id FROM \`AssignedOfficers\` WHERE nida_number = :nida`,
        { replacements: { nida: officer.nida_number } }
      ); // Changed quotes to backticks for MariaDB

      if (existing.length === 0) {
        await queryInterface.bulkInsert('AssignedOfficers', [{
          id: uuidv4(),
          ...officer,
          createdAt: new Date(),
          updatedAt: new Date()
        }]);
        console.log(`✔️  Officer created: ${officer.nida_number}`);
      } else {
        console.log(`ℹ️  Officer already exists: ${officer.nida_number}`);
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('AssignedOfficers', {
      nida_number: [
        '1990234567890001',
        '1990234567890002',
        '1990234567890003',
        '1990234567890004',
        '1990234567890005'
      ]
    });
  }
};
