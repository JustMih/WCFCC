const roleMiddleware = (roles) => {
  return (req, res, next) => {
    const userRole = req.user.role; // User's base role (string)
    
    // Check if user has any of the required roles directly
    if (!roles.includes(userRole)) {
      return res.status(403).json({ 
        message: "Permission denied",
        requiredRoles: roles,
        userRole: userRole
      });
    }
    next(); // Proceed to the next middleware or route handler
  };
};

module.exports = {roleMiddleware};
