// constants/index.js
// Common application constants, lookup dictionaries, and date/formatting helpers.

export const ROLES = {
  ADMIN: "ADMIN",
  PMC: "PMC",
  MANAGER: "MESS_MANAGER",
  SECRETARY: "MESS_SECRETARY",
  USER: "USER",
};

export const CATEGORIES = [
  ["TD_OFFICER", "Officer on TD"],
  ["OFFICER_LEAVE", "Officer on Leave"],
  ["OFFICER_GUEST", "Officer as Guest"],
  ["DEPENDANT_GUEST", "Dependant as Guest"],
];


/**
 * Return human-readable label for a system user role.
 */
export const roleName = (r) =>
  ({
    ADMIN: "Administrator",
    PMC: "PMC",
    MESS_MANAGER: "Mess Manager",
    MESS_SECRETARY: "Mess Secretary",
    USER: "Officer",
  })[r] || r;

/**
 * Return human-readable label for stay category code.
 */
export const categoryName = (c) =>
  Object.fromEntries(CATEGORIES)[c] || c || "—";

/**
 * Extract YYYY-MM-DD substring safely from any date/string input.
 */
export const dateOnly = (value) => {
  const match = String(value || "").match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

/**
 * Return current local date string in YYYY-MM-DD format.
 */
export const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
};

/**
 * Format a date string (YYYY-MM-DD or ISO) into standard Indian locale date representation (DD MMM YYYY).
 */
export const fmtDate = (value) => {
  const s = dateOnly(value);
  if (!s) return "—";
  const [year, month, day] = s.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
};

/**
 * Format a numeric amount as currency string with 2 decimal places.
 */
export const money = (n) => Number(Number(n || 0).toFixed(2));

/**
 * Calculate the number of nights between two dates (checkInDate to checkOutDate).
 */
export const calculateNights = (checkInDate, checkOutDate) => {
  const checkInValue = dateOnly(checkInDate);
  const checkOutValue = dateOnly(checkOutDate);

  if (!checkInValue || !checkOutValue) {
    return 0;
  }

  const [inYear, inMonth, inDay] = checkInValue.split("-").map(Number);
  const [outYear, outMonth, outDay] = checkOutValue.split("-").map(Number);

  const checkIn = Date.UTC(inYear, inMonth - 1, inDay);
  const checkOut = Date.UTC(outYear, outMonth - 1, outDay);

  return Math.max(0, Math.round((checkOut - checkIn) / (1000 * 60 * 60 * 24)));
};

/**
 * Add a number of days to a YYYY-MM-DD date string, returning the new YYYY-MM-DD date string.
 */
export const addDays = (dateStr, days) => {
  const base = dateOnly(dateStr);
  if (!base) return "";
  const [year, month, day] = base.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
