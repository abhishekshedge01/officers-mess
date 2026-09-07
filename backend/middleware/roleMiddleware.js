/**
 * Role-based authorization middleware. Ensures the authenticated user's role
 * is within the allowed roles.
 *
 * @param  {...string} allowedRoles Allowed user roles (e.g. "ADMIN", "MESS_MANAGER")
 */
export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    next();
  };
};
