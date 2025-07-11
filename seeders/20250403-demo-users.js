'use strict';

require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const DEFAULT_USER_ID = process.env.DEFAULT_USER_ID;
    const users = [
      { name: 'Anna Agent', email: 'agent@wcf.go.tz', username: 'anna.agent', role: 'agent' },
      { name: 'Ben Attendee', email: 'attendee@wcf.go.tz', username: 'ben.attendee', role: 'attendee' },
      { name: 'Juma Attendee', email: 'attendeejuma@wcf.go.tz', username: 'juma.attendee', role: 'attendee' },
      { name: 'Amina Attendee', email: 'attendeeamina@wcf.go.tz', username: 'amina.attendee', role: 'attendee' },
      { name: 'Rehema Focal', email: 'rehema.said3@ttcl.co.tz', username: 'rehema.focal', role: 'focal-person' },
      { name: 'Caroline Focal', email: 'focal@wcf.go.tz', username: 'caroline.focal', role: 'focal-person' },
      { name: 'John Attendee', email: 'attendeejohn@wcf.go.tz', username: 'john.attendee', role: 'attendee' },
      { name: 'Hawa Attendee', email: 'attendeehawa@wcf.go.tz', username: 'hawa.attendee', role: 'attendee' },
      { name: 'David Director', email: 'director@wcf.go.tz', username: 'david.director', role: 'director' },
      { name: 'Emily Manager', email: 'manager@wcf.go.tz', username: 'emily.manager', role: 'manager' },
      { name: 'Frank Head', email: 'headofunit@wcf.go.tz', username: 'frank.head', role: 'head-of-unit' },
      { name: 'Grace Coordinator', email: 'coordinator@wcf.go.tz', username: 'grace.coordinator', role: 'coordinator' },
      { name: 'Henry DG', email: 'dg@wcf.go.tz', username: 'henry.dg', role: 'director-general' },
      { name: 'George Supervisor', email: 'supervisor@wcf.go.tz', username: 'george.supervisor', role: 'supervisor' },
      { name: 'Head of Operations', email: 'operations@wcf.go.tz', username: 'head.operations', role: 'head', unit_section: 'Directorate of Operations' },
      { name: 'Focal Person Operations', email: 'focal.operations@wcf.go.tz', username: 'focal.operations', role: 'focal-person', unit_section: 'Directorate of Operations' },
      { name: 'Attendee Operations 1', email: 'attendee.operations1@wcf.go.tz', username: 'attendee.operations1', role: 'attendee', unit_section: 'Directorate of Operations' },
      { name: 'Attendee Operations 2', email: 'attendee.operations2@wcf.go.tz', username: 'attendee.operations2', role: 'attendee', unit_section: 'Directorate of Operations' },
      { name: 'Head of Assessment Services', email: 'assessment@wcf.go.tz', username: 'head.assessment', role: 'head', unit_section: 'Directorate of Assessment Services' },
      { name: 'Focal Person Assessment', email: 'focal.assessment@wcf.go.tz', username: 'focal.assessment', role: 'focal-person', unit_section: 'Directorate of Assessment Services' },
      { name: 'Attendee Assessment 1', email: 'attendee.assessment1@wcf.go.tz', username: 'attendee.assessment1', role: 'attendee', unit_section: 'Directorate of Assessment Services' },
      { name: 'Attendee Assessment 2', email: 'attendee.assessment2@wcf.go.tz', username: 'attendee.assessment2', role: 'attendee', unit_section: 'Directorate of Assessment Services' },
      { name: 'Head of Finance and Planning', email: 'finance@wcf.go.tz', username: 'head.finance', role: 'head', unit_section: 'Directorate of Finance, Planning and Investment' },
      { name: 'Focal Person Finance', email: 'focal.finance@wcf.go.tz', username: 'focal.finance', role: 'focal-person', unit_section: 'Directorate of Finance, Planning and Investment' },
      { name: 'Attendee Finance 1', email: 'attendee.finance1@wcf.go.tz', username: 'attendee.finance1', role: 'attendee', unit_section: 'Directorate of Finance, Planning and Investment' },
      { name: 'Attendee Finance 2', email: 'attendee.finance2@wcf.go.tz', username: 'attendee.finance2', role: 'attendee', unit_section: 'Directorate of Finance, Planning and Investment' },
      { name: 'Head of ICT', email: 'ict@wcf.go.tz', username: 'head.ict', role: 'head', unit_section: 'ICT Unit' },
      { name: 'Focal Person ICT', email: 'focal.ict@wcf.go.tz', username: 'focal.ict', role: 'focal-person', unit_section: 'ICT Unit' },
      { name: 'Attendee ICT 1', email: 'attendee.ict1@wcf.go.tz', username: 'attendee.ict1', role: 'attendee', unit_section: 'ICT Unit' },
      { name: 'Attendee ICT 2', email: 'attendee.ict2@wcf.go.tz', username: 'attendee.ict2', role: 'attendee', unit_section: 'ICT Unit' },
      { name: 'Head of Actuarial and Risk', email: 'actuarial@wcf.go.tz', username: 'head.actuarial', role: 'head', unit_section: 'Actuarial Statistics and Risk Management' },
      { name: 'Focal Person Actuarial', email: 'focal.actuarial@wcf.go.tz', username: 'focal.actuarial', role: 'focal-person', unit_section: 'Actuarial Statistics and Risk Management' },
      { name: 'Attendee Actuarial 1', email: 'attendee.actuarial1@wcf.go.tz', username: 'attendee.actuarial1', role: 'attendee', unit_section: 'Actuarial Statistics and Risk Management' },
      { name: 'Attendee Actuarial 2', email: 'attendee.actuarial2@wcf.go.tz', username: 'attendee.actuarial2', role: 'attendee', unit_section: 'Actuarial Statistics and Risk Management' },
      { name: 'Head of PR', email: 'pr@wcf.go.tz', username: 'head.pr', role: 'head', unit_section: 'Public Relation Unit' },
      { name: 'Focal Person PR', email: 'focal.pr@wcf.go.tz', username: 'focal.pr', role: 'focal-person', unit_section: 'Public Relation Unit' },
      { name: 'Attendee PR 1', email: 'attendee.pr1@wcf.go.tz', username: 'attendee.pr1', role: 'attendee', unit_section: 'Public Relation Unit' },
      { name: 'Attendee PR 2', email: 'attendee.pr2@wcf.go.tz', username: 'attendee.pr2', role: 'attendee', unit_section: 'Public Relation Unit' },
      { name: 'Head of Procurement', email: 'procurement@wcf.go.tz', username: 'head.procurement', role: 'head', unit_section: 'Procurement Management Unit' },
      { name: 'Focal Person Procurement', email: 'focal.procurement@wcf.go.tz', username: 'focal.procurement', role: 'focal-person', unit_section: 'Procurement Management Unit' },
      { name: 'Attendee Procurement 1', email: 'attendee.procurement1@wcf.go.tz', username: 'attendee.procurement1', role: 'attendee', unit_section: 'Procurement Management Unit' },
      { name: 'Attendee Procurement 2', email: 'attendee.procurement2@wcf.go.tz', username: 'attendee.procurement2', role: 'attendee', unit_section: 'Procurement Management Unit' },
      { name: 'Head of HR and Attachments', email: 'hr@wcf.go.tz', username: 'head.hr', role: 'head', unit_section: 'Human Resource Management and Attachment Unit' },
      { name: 'Focal Person HR', email: 'focal.hr@wcf.go.tz', username: 'focal.hr', role: 'focal-person', unit_section: 'Human Resource Management and Attachment Unit' },
      { name: 'Attendee HR 1', email: 'attendee.hr1@wcf.go.tz', username: 'attendee.hr1', role: 'attendee', unit_section: 'Human Resource Management and Attachment Unit' },
      { name: 'Attendee HR 2', email: 'attendee.hr2@wcf.go.tz', username: 'attendee.hr2', role: 'attendee', unit_section: 'Human Resource Management and Attachment Unit' },
      { name: 'Clara Claim Focal', email: 'claim.focal.operations@wcf.go.tz', username: 'clara.claim.operations', role: 'claim-focal-person', unit_section: 'Directorate of Operations' },
      { name: 'Colin Compliance Focal', email: 'compliance.focal.operations@wcf.go.tz', username: 'colin.compliance.operations', role: 'compliance-focal-person', unit_section: 'Directorate of Operations' },
      { name: 'Alice Claim Focal', email: 'claim.focal.assessment@wcf.go.tz', username: 'alice.claim.assessment', role: 'claim-focal-person', unit_section: 'Directorate of Assessment Services' },
      { name: 'Alex Compliance Focal', email: 'compliance.focal.assessment@wcf.go.tz', username: 'alex.compliance.assessment', role: 'compliance-focal-person', unit_section: 'Directorate of Assessment Services' },
      { name: 'Fiona Claim Focal', email: 'claim.focal.finance@wcf.go.tz', username: 'fiona.claim.finance', role: 'claim-focal-person', unit_section: 'Directorate of Finance, Planning and Investment' },
      { name: 'Felix Compliance Focal', email: 'compliance.focal.finance@wcf.go.tz', username: 'felix.compliance.finance', role: 'compliance-focal-person', unit_section: 'Directorate of Finance, Planning and Investment' },
      { name: 'Irene Claim Focal', email: 'claim.focal.ict@wcf.go.tz', username: 'irene.claim.ict', role: 'claim-focal-person', unit_section: 'ICT Unit' },
      { name: 'Ian Compliance Focal', email: 'compliance.focal.ict@wcf.go.tz', username: 'ian.compliance.ict', role: 'compliance-focal-person', unit_section: 'ICT Unit' },
      { name: 'Anita Claim Focal', email: 'claim.focal.hr@wcf.go.tz', username: 'anita.claim.hr', role: 'claim-focal-person', unit_section: 'Human Resource Management and Attachment Unit' },
      { name: 'Andrew Compliance Focal', email: 'compliance.focal.hr@wcf.go.tz', username: 'andrew.compliance.hr', role: 'compliance-focal-person', unit_section: 'Human Resource Management and Attachment Unit' },
      { name: 'Head of Operations', email: 'head.operations@wcf.go.tz', username: 'head.operations', role: 'head-of-unit', unit_section: 'directorate of operations', status: 'active' },
      { name: 'Head of Assessment', email: 'head.assessment@wcf.go.tz', username: 'head.assessment', role: 'head-of-unit', unit_section: 'directorate of assessment services', status: 'active' },
      { name: 'Head of Finance', email: 'head.finance@wcf.go.tz', username: 'head.finance', role: 'head-of-unit', unit_section: 'directorate of finance, planning and investment', status: 'active' },
      { name: 'Head of Legal', email: 'head.legal@wcf.go.tz', username: 'head.legal', role: 'head-of-unit', unit_section: 'legal unit', status: 'active' },
      { name: 'Head of ICT', email: 'head.ict@wcf.go.tz', username: 'head.ict', role: 'head-of-unit', unit_section: 'ict unit', status: 'active' },
      { name: 'Head of Actuarial', email: 'head.actuarial@wcf.go.tz', username: 'head.actuarial', role: 'head-of-unit', unit_section: 'actuarial statistics and risk management', status: 'active' },
      { name: 'Head of PR', email: 'head.pr@wcf.go.tz', username: 'head.pr', role: 'head-of-unit', unit_section: 'public relation unit', status: 'active' },
      { name: 'Head of Procurement', email: 'head.procurement@wcf.go.tz', username: 'head.procurement', role: 'head-of-unit', unit_section: 'procurement management unit', status: 'active' },
      { name: 'Head of HR', email: 'head.hr@wcf.go.tz', username: 'head.hr', role: 'head-of-unit', unit_section: 'human resource management and attachment unit', status: 'active' },
      { name: 'System', email: 'system@wcf.go.tz', username: 'system', role: 'system', unit_section: null, password: await bcrypt.hash('systempassword', 10), status: 'active' },
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
            username: user.username,
            password: hashedPassword,
            role: user.role,
            unit_section: user.unit_section || null,
            isActive: true,
            status: 'offline',
            createdAt: new Date(),
            updatedAt: new Date(),
          }], { transaction });
        
          console.log(`✔️  User created: ${user.email}`);
        } else {
          // Update existing user with new fields (including unit_section)
          await queryInterface.bulkUpdate(
            'Users',
            {
              name: user.name,
              username: user.username,
              role: user.role,
              unit_section: user.unit_section || null,
              updatedAt: new Date(),
            },
            { email: user.email },
            { transaction }
          );
          console.log(`ℹ️  User updated: ${user.email}`);
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
        'operations@wcf.go.tz',
        'focal.operations@wcf.go.tz',
        'attendee.operations1@wcf.go.tz',
        'attendee.operations2@wcf.go.tz',
        'assessment@wcf.go.tz',
        'focal.assessment@wcf.go.tz',
        'attendee.assessment1@wcf.go.tz',
        'attendee.assessment2@wcf.go.tz',
        'finance@wcf.go.tz',
        'focal.finance@wcf.go.tz',
        'attendee.finance1@wcf.go.tz',
        'attendee.finance2@wcf.go.tz',
        'ict@wcf.go.tz',
        'focal.ict@wcf.go.tz',
        'attendee.ict1@wcf.go.tz',
        'attendee.ict2@wcf.go.tz',
        'actuarial@wcf.go.tz',
        'focal.actuarial@wcf.go.tz',
        'attendee.actuarial1@wcf.go.tz',
        'attendee.actuarial2@wcf.go.tz',
        'pr@wcf.go.tz',
        'focal.pr@wcf.go.tz',
        'attendee.pr1@wcf.go.tz',
        'attendee.pr2@wcf.go.tz',
        'procurement@wcf.go.tz',
        'focal.procurement@wcf.go.tz',
        'attendee.procurement1@wcf.go.tz',
        'attendee.procurement2@wcf.go.tz',
        'hr@wcf.go.tz',
        'focal.hr@wcf.go.tz',
        'attendee.hr1@wcf.go.tz',
        'attendee.hr2@wcf.go.tz',
        'claim.focal.operations@wcf.go.tz',
        'compliance.focal.operations@wcf.go.tz',
        'claim.focal.assessment@wcf.go.tz',
        'compliance.focal.assessment@wcf.go.tz',
        'claim.focal.finance@wcf.go.tz',
        'compliance.focal.finance@wcf.go.tz',
        'claim.focal.ict@wcf.go.tz',
        'compliance.focal.ict@wcf.go.tz',
        'claim.focal.hr@wcf.go.tz',
        'compliance.focal.hr@wcf.go.tz'
      ]
    });
  }
};
