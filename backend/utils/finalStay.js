/**
 * Merges final billing details into completed bookings so checked-out stays
 * reflect actual billed stay dates, nights, bill number, and payment status.
 *
 * @param {import('mongodb').Db} db
 * @param {Array} bookings
 * @returns {Promise<Array>}
 */
export const withFinalStay = async (db, bookings) => {
  const completedIds = bookings
    .filter((booking) => booking.status === "CHECKED_OUT")
    .map((booking) => booking._id);

  if (!completedIds.length) return bookings;

  const bills = await db
    .collection("bills")
    .find(
      { bookingId: { $in: completedIds } },
      {
        projection: {
          bookingId: 1,
          actualCheckOutDate: 1,
          nights: 1,
          paymentStatus: 1,
          totalAmount: 1,
          billNumber: 1,
          paidAt: 1,
        },
      },
    )
    .toArray();

  const billByBooking = new Map(
    bills.map((bill) => [bill.bookingId.toString(), bill]),
  );

  return bookings.map((booking) => {
    const bill = billByBooking.get(booking._id.toString());
    if (!bill) return booking;

    return {
      ...booking,
      displayCheckOutDate: bill.actualCheckOutDate,
      displayNights: Math.max(1, Number(bill.nights || 1)),
      billId: bill._id,
      billNumber: bill.billNumber || null,
      billAmount: Number(bill.totalAmount || 0),
      paymentStatus: bill.paymentStatus || "PENDING",
      paidAt: bill.paidAt || null,
    };
  });
};
