/**
 * Available user roles in Officers Mess Management System.
 */
export const USER_ROLES = {
  ADMIN: "ADMIN",
  PMC: "PMC",
  MESS_MANAGER: "MESS_MANAGER",
  MESS_SECRETARY: "MESS_SECRETARY",
  USER: "USER",
};

/**
 * Factory for creating a standardized User document.
 */
export const createUserDocument = ({
  name,
  email,
  password,
  serviceId = "",
  mobile = "",
  role,
  messId = null,
}) => ({
  name: String(name).trim(),
  email: String(email).toLowerCase().trim(),
  password,
  serviceId,
  mobile,
  role,
  messId,
  accountStatus: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
});
