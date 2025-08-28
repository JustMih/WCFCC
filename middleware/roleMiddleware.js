const { hasAnyRole } = require('../utils/roleMapper');

const roleMiddleware = (roles) => {
  return (req, res, next) => {
    const userRole = req.user.role; // User's base role (string)
    const unitSection = req.user.unit_section; // User's unit section
    
    // Check if user has any of the required roles (including dynamically mapped roles)
    if (!hasAnyRole(userRole, roles, unitSection)) {
      return res.status(403).json({ 
        message: "Permission denied",
        requiredRoles: roles,
        userBaseRole: userRole,
        unitSection: unitSection,
        effectiveRoles: require('../utils/roleMapper').getEffectiveRoles(userRole, unitSection)
      });
    }
    next(); // Proceed to the next middleware or route handler
  };
};

module.exports = {roleMiddleware};
