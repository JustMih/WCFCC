const roleMiddleware = (roles) => {
  return (req, res, next) => {
    const userRole = req.user.role; // Assuming the role is attached to `req.user` by the auth middleware
    if (!roles.includes(userRole)) {
      return res.status(403).json({ message: "Permission denied" });
    }
    next(); // Proceed to the next middleware or route handler
  };
};

module.exports = {roleMiddleware};
