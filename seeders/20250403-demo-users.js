'use strict';

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;
    // const now = new Date();
    const users = [
      { name: 'Anna Agent', email: 'agent@wcf.go.tz', phone_number: '0712000001', role: 'agent' },
      { name: 'Ben Attendee', email: 'attendee@wcf.go.tz', phone_number: '0712000002', role: 'attendee' },
      { name: 'Juma Attendee', email: 'attendeejuma@wcf.go.tz', phone_number: '0712000012', role: 'attendee' },
      { name: 'Amina Attendee', email: 'attendeeamina@wcf.go.tz', phone_number: '0712000202', role: 'attendee' },
      { name: 'Caroline Focal', email: 'focal@wcf.go.tz', phone_number: '0712003003', role: 'focal-person' },
      { name: 'John Attendee', email: 'attendeejohn@wcf.go.tz', phone_number: '0712020002', role: 'attendee' },
      { name: 'Hawa Attendee', email: 'attendeehawa@wcf.go.tz', phone_number: '0712029002', role: 'attendee' },
      { name: 'David Director', email: 'director@wcf.go.tz', phone_number: '0712000004', role: 'director' },
      { name: 'Emily Manager', email: 'manager@wcf.go.tz', phone_number: '0712000005', role: 'manager' },
      { name: 'Frank Head', email: 'headofunit@wcf.go.tz', phone_number: '0712000006', role: 'head-of-unit' },
      { name: 'Grace Coordinator', email: 'coordinator@wcf.go.tz', phone_number: '0712000007', role: 'coordinator' },
      { name: 'Henry DG', email: 'dg@wcf.go.tz', phone_number: '0712000008', role: 'director-general' },
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
          const userId = (user.email === 'agent@wcf.go.tz') 
            ? DEFAULT_USER_ID 
            : uuidv4(); // Use DEFAULT_USER_ID for the agent, otherwise generate new UUID
        
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
        'attendee@wcf.go.tz',
        'attendeejuma@wcf.go.tz',
        'attendeeamina@wcf.go.tz',
        'focal@wcf.go.tz',
        'attendeejohn@wcf.go.tz',
        'attendeehawa@wcf.go.tz',
        'director@wcf.go.tz',
        'manager@wcf.go.tz',
        'headofunit@wcf.go.tz',
        'coordinator@wcf.go.tz',
        'dg@wcf.go.tz',
      ]
    });
  }
};
