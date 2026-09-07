// controllers/revenueController.js
// Aggregates monthly and annual financial metrics, bill breakdowns, and payment histories for officers mess staff.

import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

// Format a number safely to 2 decimal places
const money = (n) => Number(Number(n || 0).toFixed(2));

/**
 * Calculate UTC month start and end boundaries for filtering.
 */
const monthBounds = (month) => {
  const m = /^\d{4}-\d{2}$/.test(String(month || ""))
    ? month
    : new Date().toISOString().slice(0, 7);
  const [y, mo] = m.split("-").map(Number);
  return {
    month: m,
    start: new Date(Date.UTC(y, mo - 1, 1)),
    end: new Date(Date.UTC(y, mo, 1)),
  };
};

/**
 * Calculate UTC year start and end boundaries for filtering.
 */
const yearBounds = (year) => {
  const y = /^\d{4}$/.test(String(year || ""))
    ? Number(year)
    : new Date().getUTCFullYear();
  return {
    year: y,
    start: new Date(Date.UTC(y, 0, 1)),
    end: new Date(Date.UTC(y + 1, 0, 1)),
  };
};

/**
 * Find the staff user and ensure they have a privileged role.
 */
const getStaff = async (req) => {
  const db = getDB();
  if (!ObjectId.isValid(req.user?.id)) return null;
  return db.collection("users").findOne(
    {
      _id: new ObjectId(req.user.id),
      role: { $in: ["MESS_MANAGER", "PMC", "MESS_SECRETARY"] },
    },
    { projection: { password: 0 } },
  );
};

/**
 * Base MongoDB query filter for paid bills within a time range.
 */
const baseFilter = (messId, start, end) => ({
  messId,
  paymentStatus: "PAID",
  paidAt: { $gte: start, $lt: end },
});

/**
 * Get aggregated revenue metrics, category breakdowns, and transaction lists for a mess.
 */
const getRevenue = async (req, res) => {
  try {
    const staff = await getStaff(req);
    if (!staff?.messId) {
      return res
        .status(403)
        .json({ message: "You are not assigned to a mess" });
    }

    const db = getDB();
    const messId = new ObjectId(staff.messId);
    const now = new Date();
    const monthInfo = monthBounds(req.query.month);
    const yearInfo = yearBounds(req.query.year);

    // Concurrently fetch monthly paid bills, yearly paid bills, pending bills, and mess details
    const [monthBills, yearBills, pendingBills, mess] = await Promise.all([
      db
        .collection("bills")
        .find(baseFilter(messId, monthInfo.start, monthInfo.end))
        .sort({ paidAt: -1 })
        .toArray(),
      db
        .collection("bills")
        .find(baseFilter(messId, yearInfo.start, yearInfo.end))
        .sort({ paidAt: -1 })
        .toArray(),
      db
        .collection("bills")
        .find({
          messId,
          paymentStatus: { $in: ["PENDING", "PAYMENT_PROCESSING"] },
        })
        .sort({ createdAt: -1 })
        .toArray(),
      db.collection("messes").findOne({ _id: messId }),
    ]);

    const sum = (rows, field = "totalAmount") =>
      money(rows.reduce((a, b) => a + Number(b[field] || 0), 0));
    const gatewayFee = (rows) =>
      money(rows.reduce((a, b) => a + Number(b.gatewayFee || 0), 0));
    const gatewayTax = (rows) =>
      money(rows.reduce((a, b) => a + Number(b.gatewayTax || 0), 0));
    const extraCharges = (rows) =>
      money(
        rows.reduce((total, b) => total + Number(b.extraChargesTotal || 0), 0),
      );

    const grossMonth = sum(monthBills);
    const grossYear = sum(yearBills);
    const actualFeeMonth = gatewayFee(monthBills);
    const actualTaxMonth = gatewayTax(monthBills);
    const actualFeeYear = gatewayFee(yearBills);
    const actualTaxYear = gatewayTax(yearBills);

    // Offline demo mode: fallback estimate calculation
    const estimatedRate = 0;
    const estimatedGst = 0;
    const estimate = (gross) => {
      const fee = money(gross * estimatedRate);
      const tax = money(fee * estimatedGst);
      return {
        fee,
        tax,
        total: money(fee + tax),
        net: money(gross - fee - tax),
      };
    };

    // Build 12-month series for the yearly revenue breakdown
    const months = Array.from({ length: 12 }, (_, i) => {
      const start = new Date(Date.UTC(yearInfo.year, i, 1));
      const end = new Date(Date.UTC(yearInfo.year, i + 1, 1));
      return {
        label: start.toLocaleString("en-IN", {
          month: "short",
          timeZone: "UTC",
        }),
        month: `${yearInfo.year}-${String(i + 1).padStart(2, "0")}`,
        start,
        end,
      };
    });

    const yearSeries = await Promise.all(
      months.map(async (m) => {
        const rows = await db
          .collection("bills")
          .find(baseFilter(messId, m.start, m.end), {
            projection: { totalAmount: 1, gatewayFee: 1, gatewayTax: 1 },
          })
          .toArray();
        return {
          month: m.month,
          label: m.label,
          revenue: sum(rows),
          transactions: rows.length,
          gatewayCharges: money(gatewayFee(rows) + gatewayTax(rows)),
        };
      }),
    );

    // Group annual revenue by stayCategory (e.g. OFFICIAL, LEAVE, CASUAL)
    const categoryMap = {};
    for (const b of yearBills) {
      const key = b.stayCategory || "OTHER";
      if (!categoryMap[key])
        categoryMap[key] = { category: key, revenue: 0, transactions: 0 };
      categoryMap[key].revenue += Number(b.totalAmount || 0);
      categoryMap[key].transactions += 1;
    }

    const monthEstimated = estimate(grossMonth);
    const yearEstimated = estimate(grossYear);
    const actualMonthCharges = actualFeeMonth + actualTaxMonth;
    const actualYearCharges = actualFeeYear + actualTaxYear;

    return res.json({
      mess: {
        id: mess?._id,
        name: mess?.name || "Officers Mess",
        city: mess?.city || "",
        address: mess?.address || "",
      },
      period: { month: monthInfo.month, year: yearInfo.year },
      month: {
        grossRevenue: grossMonth,
        transactions: monthBills.length,
        pendingAmount: sum(pendingBills),
        extraChargesRevenue: extraCharges(monthBills),
        gatewayCharges: actualMonthCharges || monthEstimated.total,
        gatewayChargesSource: actualMonthCharges ? "RECORDED" : "OFFLINE_DEMO",
        netRevenue: actualMonthCharges
          ? money(grossMonth - actualMonthCharges)
          : monthEstimated.net,
      },
      year: {
        grossRevenue: grossYear,
        transactions: yearBills.length,
        extraChargesRevenue: extraCharges(yearBills),
        gatewayCharges: actualYearCharges || yearEstimated.total,
        gatewayChargesSource: actualYearCharges ? "RECORDED" : "OFFLINE_DEMO",
        netRevenue: actualYearCharges
          ? money(grossYear - actualYearCharges)
          : yearEstimated.net,
      },
      categoryBreakdown: Object.values(categoryMap).map((x) => ({
        ...x,
        revenue: money(x.revenue),
      })),
      monthlySeries: yearSeries,
      recentPayments: monthBills.map((b) => ({
        id: b._id,
        billId: b.billNumber || b._id,
        invoiceNumber: b.invoiceNumber,
        bookingId: b.bookingId,
        rank: b.booker?.rank || "",
        name: b.booker?.name || "Guest",
        serviceId: b.booker?.serviceId || "",
        email: b.booker?.email || "",
        mobile: b.booker?.mobile || "",
        category: b.stayCategory,
        roomNumber: b.roomNumber || "",
        checkInDate: b.checkInDate || null,
        checkOutDate: b.actualCheckOutDate || b.scheduledCheckOutDate || null,
        nights: b.nights || 1,
        amount: money(b.totalAmount),
        paidAt: b.paidAt,
        paymentId: b.paymentId,
      })),
      generatedAt: now,
    });
  } catch (error) {
    console.error("REVENUE ERROR:", error);
    return res.status(500).json({ message: "Unable to load revenue" });
  }
};

export const getMessRevenue = getRevenue;
