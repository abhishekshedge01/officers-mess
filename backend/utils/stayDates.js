import { ObjectId } from "mongodb";

// Stay dates are calendar dates in India (IST), stored and compared in YYYY-MM-DD format.
const IST = "Asia/Kolkata";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Extracts YYYY-MM-DD from a Date object or date-like string.
 */
export const dateOnly = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: IST,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

/**
 * Returns today's date in IST (YYYY-MM-DD).
 */
export const todayIndia = () => dateOnly(new Date());

/**
 * Converts a date string into a UTC Date object at midnight.
 */
export const day = (value) => {
  const clean = dateOnly(value);
  if (!DATE_RE.test(clean)) return null;
  const [year, month, date] = clean.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date));
};

/**
 * Formats a Date object as YYYY-MM-DD.
 */
export const formatDay = (value) => value.toISOString().slice(0, 10);

/**
 * Adds or subtracts days from a YYYY-MM-DD string.
 */
export const addDays = (value, count) => {
  const result = day(value);
  if (!result) return "";
  result.setUTCDate(result.getUTCDate() + count);
  return formatDay(result);
};

/**
 * Generates an array of continuous date strings [from, to).
 */
export const stayDates = (from, to) => {
  const start = day(from);
  const end = day(to);
  if (!start || !end || start >= end) return [];
  const result = [];
  for (
    let current = new Date(start);
    current < end;
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    result.push(formatDay(current));
  }
  return result;
};

/**
 * Calculates number of nights between check-in and check-out.
 */
export const nightsBetween = (from, to) => stayDates(from, to).length;

/**
 * Validates that stay range has valid formats and to > from.
 */
export const validStayRange = (from, to) =>
  Boolean(day(from) && day(to) && day(to) > day(from));

/**
 * Marks expired APPROVED bookings as NO_SHOW if checkInDate has passed,
 * and frees up their room allocations.
 */
export const markExpiredApprovedBookingsAsNoShow = async (db, messId) => {
  const today = todayIndia();
  const query = { status: "APPROVED" };
  if (messId) {
    const str = String(messId);
    query.messId = ObjectId.isValid(str) ? { $in: [str, new ObjectId(str)] } : str;
  }

  const bookings = await db
    .collection("bookings")
    .find(query)
    .toArray();

  for (const booking of bookings) {
    const checkInDate = String(booking.checkInDate || "").slice(0, 10);
    if (!checkInDate || today <= checkInDate) continue;

    const now = new Date();
    const updated = await db
      .collection("bookings")
      .updateOne(
        { _id: booking._id, status: "APPROVED" },
        {
          $set: {
            status: "NO_SHOW",
            noShowAt: now,
            updatedAt: now,
            roomId: null,
            roomNumber: null,
          },
        },
      );

    if (updated.modifiedCount > 0) {
      await db
        .collection("room_allocations")
        .updateMany(
          { bookingId: booking._id, status: "ACTIVE" },
          { $set: { status: "COMPLETED", updatedAt: now } },
        );
    }
  }
};
