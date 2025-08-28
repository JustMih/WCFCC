const { Ticket, User } = require('./models');
const sequelize = require('./config/mysql_connection');

async function debugAssignee() {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // Find tickets assigned to reviewers
    const tickets = await Ticket.findAll({
      where: { assigned_to_role: 'reviewer' },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'full_name', 'role', 'username']
        }
      ],
      limit: 5
    });

    console.log(`Found ${tickets.length} tickets assigned to reviewers:`);
    console.log('==========================================');

    tickets.forEach((ticket, index) => {
      console.log(`\nTicket ${index + 1}:`);
      console.log('  Ticket ID:', ticket.id);
      console.log('  Assigned to ID:', ticket.assigned_to_id);
      console.log('  Assigned to Role:', ticket.assigned_to_role);
      console.log('  Assignee Object:', ticket.assignee ? 'EXISTS' : 'NULL');
      
      if (ticket.assignee) {
        console.log('  Assignee ID:', ticket.assignee.id);
        console.log('  Assignee Full Name:', ticket.assignee.full_name);
        console.log('  Assignee Role:', ticket.assignee.role);
        console.log('  Assignee Username:', ticket.assignee.username);
      } else {
        console.log('  Assignee is NULL - checking if user exists...');
        // Check if the user exists
        User.findByPk(ticket.assigned_to_id).then(user => {
          if (user) {
            console.log('  User exists with ID:', user.id);
            console.log('  User Full Name:', user.full_name);
            console.log('  User Role:', user.role);
          } else {
            console.log('  User does not exist with ID:', ticket.assigned_to_id);
          }
        }).catch(err => {
          console.log('  Error finding user:', err.message);
        });
      }
    });

    // Also check all users with reviewer role
    console.log('\n==========================================');
    console.log('All users with reviewer role:');
    const reviewers = await User.findAll({
      where: { role: 'reviewer' },
      attributes: ['id', 'full_name', 'role', 'username']
    });

    reviewers.forEach((reviewer, index) => {
      console.log(`\nReviewer ${index + 1}:`);
      console.log('  ID:', reviewer.id);
      console.log('  Full Name:', reviewer.full_name);
      console.log('  Role:', reviewer.role);
      console.log('  Username:', reviewer.username);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
    process.exit(0);
  }
}

debugAssignee();
