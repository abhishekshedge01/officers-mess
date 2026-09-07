import dotenv from "dotenv";
dotenv.config();
import { MongoClient, ObjectId } from "mongodb";
import { stayDates as dates } from "./utils/stayDates.js";

const RATES = { TD_OFFICER: 2800, OFFICER_LEAVE: 1000, OFFICER_GUEST: 1000, DEPENDANT_GUEST: 1000 };

const run = async () => {
  const client = new MongoClient(process.env.MONGO_URI || "mongodb://127.0.0.1:27017");
  await client.connect();
  const db = client.db(process.env.DB_NAME || "officers-mess");
  const bills = await db.collection("bills").find({ paymentStatus: { $ne: "PAID" }, totalAmount: 0 }).toArray();
  let fixed = 0;
  for (const bill of bills) {
    const booking = await db.collection("bookings").findOne({ _id: bill.bookingId });
    if (!booking) continue;
    const rate = RATES[booking.stayCategory];
    if (!rate) continue;
    const checkout = bill.actualCheckOutDate || booking.checkOutDate;
    const nights = Math.max(1, dates(booking.checkInDate, checkout).length);
    const amount = rate * nights;
    await db.collection("bills").updateOne(
      { _id: bill._id, paymentStatus: { $ne: "PAID" } },
      { $set: {
        stayCategory: booking.stayCategory,
        checkInDate: booking.checkInDate,
        scheduledCheckOutDate: booking.checkOutDate,
        nights,
        items: [{ description: `Accommodation · ${String(booking.stayCategory).replaceAll("_", " ")}`, quantity: nights, rate, amount }],
        subtotal: amount,
        tax: 0,
        totalAmount: amount,
        currency: "INR",
        updatedAt: new Date()
      }}
    );
    fixed++;
    console.log(`Fixed ${bill._id}: ₹${amount} (${booking.stayCategory}, ${nights} night(s))`);
  }
  console.log(`Done. Fixed ${fixed} zero-value bill(s).`);
  await client.close();
};
run().catch(e => { console.error(e); process.exit(1); });
