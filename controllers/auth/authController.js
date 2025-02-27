const User = require("../../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const registerSuperAdmin = async () => {
  try {
    const existingAdmin = await User.findOne({ where: { role: "super-admin" } });
    if (existingAdmin) {
      console.log("Super Admin already exists");
      return;
    }

    const hashedPassword = await bcrypt.hash("superadmin123", 10);
    await User.create({
      name: "Super Admin",
      email: "superadmin@wcf.go.tz",
      password: hashedPassword,
      role: "super-admin",
      isActive: true,
    });
    console.log("Super Admin created successfully");
  } catch (error) {
    console.error("Error creating Super Admin:", error);
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  // Check if email exists
  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  // Check if password matches
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ message: "Invalid email or password" });
  }

  // Check if user is active
  if (!user.isActive) {
    return res.status(400).json({ message: "Account is inactive" });
  }

  // Create JWT token
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1h" } // Token expiration time
  );

  // Return user object with isActive and name along with token
  res.json({
    message: "Login successful",
    token,
    user: {
      name: user.name,
      isActive: user.isActive,
      role: user.role,
    },
  });
};


const logout = (req, res) => {
  res.json({ message: "Logged out successfully" });
};

module.exports = { registerSuperAdmin, login, logout };