const User = require("../../models/User");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator"); // For input validation

const createUser = async (req, res) => {
  try {
    const { name, email, password, role, isActive } = req.body;

    if (
      ![
        "admin",
        "supervisor",
        "agent",
        "attendee",
        "coordinator",
        "head-of-unit",
        "manager",
        "director",
        "focal-person",
        "director-general",
      ].includes(role)
    ) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      isActive,
    });

    res
      .status(201)
      .json({ message: "User created successfully", user: newUser });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent" },
    });

    const agentCount = agents.length;

    res.status(200).json({
      agents,
      count: agentCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAgentOnline = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "online" },
    });

    const agentCount = agents.length;

    // Debugging: Check how many online agents were found
    console.log(`Found ${agentCount} online agents`);

    res.status(200).json({ agentCount });
  } catch (error) {
    console.error("Error fetching online agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const getAgentOffline = async (req, res) => {
  try {
    const agents = await User.findAll({
      where: { role: "agent", status: "offline" },
    });

    const agentCount = agents.length;

    // Debugging: Check how many offline agents were found
    console.log(`Found ${agentCount} offline agents`);

    res.status(200).json({ agentCount });
  } catch (error) {
    console.error("Error fetching offline agents:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};




const deleteUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.destroy(); // Delete the user from the database
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const activateUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = true;
    await user.save();
    res.status(200).json({ message: "User activated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deactivateUser = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.isActive = false;
    await user.save();
    res.status(200).json({ message: "User deactivated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateUser = async (req, res) => {
  const userId = req.params.id;
  const { name, email, password, role } = req.body;

  try {
    // Find the user by ID
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate input fields (you can extend this logic as needed)
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if email is being updated and ensure it's unique
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: "Email already in use" });
      }
      user.email = email;
    }

    // Update other fields if provided
    if (name) user.name = name;
    if (password) {
      // Hash new password if provided
      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
    }
    if (role) user.role = role; // Optional: Only allow certain roles for admins

    // Save updated user to the database
    await user.save();

    // Return the updated user data
    res.status(200).json({
      message: "User updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const resetUserPassword = async (req, res) => {
  const userId = req.params.id;
  const defaultPassword = "wcf12345"; // Default password to reset to

  try {
    // Check if the user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the default password
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    user.password = hashedPassword;

    // Save the updated password
    await user.save();

    res.status(200).json({
      message: "Password reset successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getAgents,
  deleteUser,
  activateUser,
  deactivateUser,
  updateUser,
  resetUserPassword,
  getAgentOnline,
  getAgentOffline,
};
