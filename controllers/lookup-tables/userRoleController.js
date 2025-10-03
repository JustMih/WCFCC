const User = require("../../models/User");
const NewRole = require("../../models/NewRole");
const UserRole = require("../../models/UserRole");
const { validationResult } = require("express-validator");

// Get all roles for a specific user
const getUserRoles = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      include: [
        {
          model: NewRole,
          as: "roles",
          through: { attributes: [] }, // Exclude junction table attributes
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user.roles,
    });
  } catch (error) {
    console.error("Error fetching user roles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Assign roles to a user
const assignRolesToUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { userId } = req.params;
    const { roleIds } = req.body; // Array of role IDs

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate all roles exist
    const roles = await NewRole.findAll({
      where: { id: roleIds },
    });

    if (roles.length !== roleIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more roles not found",
      });
    }

    // Remove existing roles and assign new ones
    await user.setRoles(roles);

    // Update user's primary role in Users table
    // Use the first role as the primary role, or keep existing if no roles assigned
    if (roles.length > 0) {
      const primaryRole = roles[0].name;
      await user.update({ role: primaryRole });
    }

    // Fetch updated user with roles
    const updatedUser = await User.findByPk(userId, {
      include: [
        {
          model: NewRole,
          as: "roles",
          through: { attributes: [] },
        },
      ],
    });

    res.status(200).json({
      success: true,
      message: "Roles assigned successfully and user's primary role updated",
      data: updatedUser.roles,
    });
  } catch (error) {
    console.error("Error assigning roles to user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Add a single role to a user
const addRoleToUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: "Validation errors",
        errors: errors.array(),
      });
    }

    const { userId } = req.params;
    const { roleId } = req.body;

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate role exists
    const role = await NewRole.findByPk(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Check if user already has this role
    const existingUserRole = await UserRole.findOne({
      where: { userId, roleId },
    });

    if (existingUserRole) {
      return res.status(400).json({
        success: false,
        message: "User already has this role",
      });
    }

    // Add role to user
    await user.addRole(role);

    // Update user's primary role if they don't have one set
    if (!user.role || user.role === "agent") {
      await user.update({ role: role.name });
    }

    res.status(200).json({
      success: true,
      message:
        "Role added to user successfully and primary role updated if needed",
    });
  } catch (error) {
    console.error("Error adding role to user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Remove a role from a user
const removeRoleFromUser = async (req, res) => {
  try {
    const { userId, roleId } = req.params;

    // Validate user exists
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Validate role exists
    const role = await NewRole.findByPk(roleId);
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    // Remove role from user
    await user.removeRole(role);

    // Check if the removed role was the user's primary role
    if (user.role === role.name) {
      // Get remaining roles for the user
      const remainingRoles = await user.getRoles();

      if (remainingRoles.length > 0) {
        // Set the first remaining role as the new primary role
        await user.update({ role: remainingRoles[0].name });
      } else {
        // If no roles left, set to default 'agent' role
        await user.update({ role: "agent" });
      }
    }

    res.status(200).json({
      success: true,
      message:
        "Role removed from user successfully and primary role updated if needed",
    });
  } catch (error) {
    console.error("Error removing role from user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all users with their roles
const getAllUsersWithRoles = async (req, res) => {
  try {
    const users = await User.findAll({
      include: [
        {
          model: NewRole,
          as: "roles",
          through: { attributes: [] },
        },
      ],
    });

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Error fetching users with roles:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

module.exports = {
  getUserRoles,
  assignRolesToUser,
  addRoleToUser,
  removeRoleFromUser,
  getAllUsersWithRoles,
};
