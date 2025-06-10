"use strict";

const { faker } = require("@faker-js/faker");

module.exports = {
  async up(queryInterface, Sequelize) {
    let users = [];
    for (let i = 0; i < 500; i++) {
      users.push({
        first_name: faker.person.firstName(),
        middle_name: faker.datatype.boolean() ? faker.person.firstName() : null,
        last_name: faker.person.lastName(),
        phone_number: faker.phone.number("07########"), // updated from phoneNumber to number
        nida_number: faker.datatype.boolean()
          ? faker.string.alphanumeric(14)
          : null, // updated from random.alphaNumeric
        institution: faker.datatype.boolean() ? faker.company.name() : null,
        region: faker.location.state(),
        district: faker.location.city(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await queryInterface.bulkInsert("demo_mac", users, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("demo_mac", null, {});
  },
};
