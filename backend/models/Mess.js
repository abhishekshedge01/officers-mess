/**
 * Factory for creating a standardized Mess document.
 */
export const createMessDocument = ({
  name,
  location = "",
  city = "",
  state = "",
  address = "",
  contactNumber = null,
  description = null,
  facilities = [],
}) => ({
  name: String(name).trim(),
  location: String(location).trim(),
  city: String(city).trim(),
  state: String(state).trim(),
  address: String(address).trim(),
  contactNumber,
  description,
  facilities: Array.isArray(facilities) ? facilities : [],
  status: "ACTIVE",
  pmcId: null,
  managerId: null,
  secretaryId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
