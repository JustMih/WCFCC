/**
 * Role mapping utility to dynamically assign roles based on organizational structure
 */

// Role aliases - map one role to behave like another
const ROLE_ALIASES = {
  'reviewer': 'coordinator' // reviewer should behave like coordinator
};

const ROLE_MAPPINGS = {
  // Map head-of-unit + specific unit_section to additional roles
  'head-of-unit': {
    'public relation unit': ['reviewer'], // Only public relation unit gets reviewer role
    // Remove other unit mappings - only public relation unit should get reviewer
  },
  // Remove director and director-general mappings - they don't get reviewer role
};

/**
 * Get effective roles for a user based on their base role and unit section
 * @param {string} baseRole - The user's base role
 * @param {string} unitSection - The user's unit section
 * @returns {Array} Array of effective roles
 */
function getEffectiveRoles(baseRole, unitSection = null) {
  // Start with the base role
  const effectiveRoles = [baseRole];
  
  // Apply role aliases first
  if (ROLE_ALIASES[baseRole]) {
    effectiveRoles.push(ROLE_ALIASES[baseRole]);
  }
  
  // Apply role mappings
  const mappings = ROLE_MAPPINGS[baseRole];
  if (mappings) {
    // Check for specific unit section mapping
    if (unitSection && mappings[unitSection.toLowerCase()]) {
      effectiveRoles.push(...mappings[unitSection.toLowerCase()]);
    }
    
    // Check for 'any' mapping (applies regardless of unit section)
    if (mappings['any']) {
      effectiveRoles.push(...mappings['any']);
    }
  }
  
  // Remove duplicates and return
  return [...new Set(effectiveRoles)];
}

/**
 * Check if user has a specific role (including mapped roles)
 * @param {string} userRole - The user's base role
 * @param {string} requiredRole - The role to check for
 * @param {string} unitSection - The user's unit section
 * @returns {boolean} True if user has the required role
 */
function hasRole(userRole, requiredRole, unitSection = null) {
  const effectiveRoles = getEffectiveRoles(userRole, unitSection);
  return effectiveRoles.includes(requiredRole);
}

/**
 * Check if user has any of the required roles
 * @param {string} userRole - The user's base role
 * @param {Array} requiredRoles - Array of roles to check for
 * @param {string} unitSection - The user's unit section
 * @returns {boolean} True if user has any of the required roles
 */
function hasAnyRole(userRole, requiredRoles, unitSection = null) {
  const effectiveRoles = getEffectiveRoles(userRole, unitSection);
  return requiredRoles.some(role => effectiveRoles.includes(role));
}

/**
 * Get all possible roles for a given base role and unit section
 * @param {string} baseRole - The base role
 * @param {string} unitSection - The unit section
 * @returns {Array} Array of all possible roles
 */
function getAllPossibleRoles(baseRole, unitSection = null) {
  return getEffectiveRoles(baseRole, unitSection);
}

module.exports = {
  getEffectiveRoles,
  hasRole,
  hasAnyRole,
  getAllPossibleRoles,
  ROLE_MAPPINGS,
  ROLE_ALIASES
};
