/**
 * Room statuses and standard default accommodation tariff rates (₹ per night).
 */
export const ROOM_STATUSES = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
};

export const DEFAULT_ROOM_RATES = {
  TD_OFFICER: 2800,
  OFFICER_LEAVE: 1000,
  OFFICER_GUEST: 1000,
  DEPENDANT_GUEST: 1000,
  CHILD: 0,
};

export const DEFAULT_MEAL_RATES = {
  BREAKFAST: 150,
  LUNCH: 250,
  DINNER: 250,
};

/**
 * Factory for creating a standardized Room document.
 */
export const createRoomDocument = ({
  messId,
  roomNumber,
  roomType = "STANDARD",
  capacity,
  rates = {},
  mealRates = {},
}) => ({
  messId,
  roomNumber: String(roomNumber).trim(),
  roomType: String(roomType).trim().toUpperCase(),
  capacity: Number(capacity),
  rates: { ...DEFAULT_ROOM_RATES, ...rates },
  mealRates: { ...DEFAULT_MEAL_RATES, ...mealRates },
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
});
