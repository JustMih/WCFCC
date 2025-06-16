'use strict';
const bcrypt = require('bcryptjs');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    return queryInterface.bulkInsert('Users', [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Director General',
        email: 'dg@wcf.go.tz',
        password: hashedPassword,
        role: 'director-general',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        name: 'Operations Director',
        email: 'operations@wcf.go.tz',
        password: hashedPassword,
        role: 'directorate of operations',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Assessment Services Director',
        email: 'assessment@wcf.go.tz',
        password: hashedPassword,
        role: 'directorate of assessment services',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        name: 'Finance Director',
        email: 'finance@wcf.go.tz',
        password: hashedPassword,
        role: 'directorate of finance, planning and investment',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        name: 'Legal Head',
        email: 'legal@wcf.go.tz',
        password: hashedPassword,
        role: 'legal unit',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440005',
        name: 'ICT Head',
        email: 'ict@wcf.go.tz',
        password: hashedPassword,
        role: 'ict unit',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440006',
        name: 'Actuarial Head',
        email: 'actuarial@wcf.go.tz',
        password: hashedPassword,
        role: 'actuarial statistics and risk management',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440007',
        name: 'PR Head',
        email: 'pr@wcf.go.tz',
        password: hashedPassword,
        role: 'public relation unit',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440008',
        name: 'Procurement Head',
        email: 'procurement@wcf.go.tz',
        password: hashedPassword,
        role: 'procurement management unit',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440009',
        name: 'HR Head',
        email: 'hr@wcf.go.tz',
        password: hashedPassword,
        role: 'human resource management and attachment unit',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        name: 'Focal Person',
        email: 'focal@wcf.go.tz',
        password: hashedPassword,
        role: 'focal-person',
        isActive: true,
        status: 'online',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('Users', null, {});
  }
}; 