'use strict';

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const users = [
      { name: 'Anna Agent', email: 'agent@wcf.go.tz', phone_number: '0712000001', role: 'agent' },
      { name: 'Head of Operations', email: 'operations@wcf.go.tz', phone_number: '0712000002', role: 'Directorate of Operations' },
      { name: 'Head of Assessment Services', email: 'assessment@wcf.go.tz', phone_number: '0712000003', role: 'Directorate of Assessment Services' },
      { name: 'Head of Finance and Planning', email: 'finance@wcf.go.tz', phone_number: '0712000004', role: 'Directorate of Finance, Planning and Investment' },
      { name: 'Head of ICT', email: 'ict@wcf.go.tz', phone_number: '0712000005', role: 'ICT Unit' },
      { name: 'Head of Actuarial and Risk', email: 'actuarial@wcf.go.tz', phone_number: '0712000006', role: 'Actuarial Statistics and Risk Management' },
      { name: 'Head of PR', email: 'pr@wcf.go.tz', phone_number: '0712000007', role: 'Public Relation Unit' },
      { name: 'Head of Procurement', email: 'procurement@wcf.go.tz', phone_number: '0712000008', role: 'Procurement Management Unit' },
      { name: 'Head of HR and Attachments', email: 'hr@wcf.go.tz', phone_number: '0712000009', role: 'Human Resource Management and Attachment Unit' }
    ];

    const hashedPassword = await bcrypt.hash('user12345', 10);

    // Use a transaction to ensure atomicity
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const user of users) {
        const [existing] = await queryInterface.sequelize.query(
          'SELECT * FROM Users WHERE email = :email',
          {
            replacements: { email: user.email },
            transaction,
          }
        );

        if (existing.length === 0) {
          const userId = uuidv4(); // Generate new UUID for each user
        
          await queryInterface.bulkInsert('Users', [{
            id: userId,
            name: user.name,
            email: user.email,
            phone_number: user.phone_number,
            password: hashedPassword,
            role: user.role,
            isActive: true,
            status: 'offline',
            createdAt: new Date(),
            updatedAt: new Date(),
          }], { transaction });
        
          console.log(`✔️  User created: ${user.email}`);
        } else {
          console.log(`ℹ️  User already exists: ${user.email}`);
        }
      }
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Users', {
      email: [
        'agent@wcf.go.tz',
        'operations@wcf.go.tz',
        'assessment@wcf.go.tz',
        'finance@wcf.go.tz',
        'ict@wcf.go.tz',
        'actuarial@wcf.go.tz',
        'pr@wcf.go.tz',
        'procurement@wcf.go.tz',
        'hr@wcf.go.tz'
      ]
    });
  }
};
