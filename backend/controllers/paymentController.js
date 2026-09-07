import { ObjectId } from "mongodb";
import crypto from "crypto";
import { getDB } from "../config/db.js";
import { broadcastMessEvent } from "../utils/notificationHelper.js";

const money = (value) => Number(value || 0).toFixed(2);
const safeDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-IN") : "—";
const safeDateTime = (value) =>
  value ? new Date(value).toLocaleString("en-IN") : "—";
const text = (value, fallback = "—") => String(value ?? "").trim() || fallback;

/**
 * Sequential document number generator for invoices (INV) and receipts (REC).
 */
const nextDocumentNumber = async (db, field, prefix) => {
  const year = new Date().getFullYear();
  const key = `${field}_${year}`;
  const result = await db
    .collection("counters")
    .findOneAndUpdate(
      { _id: key },
      { $inc: { sequence: 1 }, $set: { updatedAt: new Date() } },
      { upsert: true, returnDocument: "after" },
    );
  const sequence = result?.value?.sequence ?? result?.sequence ?? 1;
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
};

/**
 * Retrieve bill document ensuring user ownership.
 */
const getBillForUser = async (db, billId, userId) =>
  db.collection("bills").findOne({
    _id: new ObjectId(billId),
    userId: new ObjectId(userId),
  });

const pdfEscape = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");

/**
 * PDF generation primitive without external dependencies.
 */
const makePdf = (commands) => {
  const content = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets[i + 1] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++)
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
};

const addText = (commands, x, y, value, size = 10, bold = false) => {
  commands.push(
    `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`,
  );
};

const addItalicText = (commands, x, y, value, size = 10) => {
  commands.push(`BT /F3 ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
};

const fillRect = (commands, x, y, w, h, gray = 0.96) => {
  commands.push(`${gray} g ${x} ${y} ${w} ${h} re f 0 g`);
};

const signatureName = (person) => {
  if (!person) return "Authorized Signatory";
  return (
    [person.rank, person.name].filter(Boolean).join(" ") ||
    "Authorized Signatory"
  );
};

const line = (commands, x1, y1, x2, y2, width = 1) => {
  commands.push(`${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
};

const rect = (commands, x, y, w, h, width = 1) => {
  commands.push(`${width} w ${x} ${y} ${w} ${h} re S`);
};

const fetchReceiptContext = async (db, bill) => {
  const mess = bill.messId
    ? await db.collection("messes").findOne({ _id: new ObjectId(bill.messId) })
    : null;

  const secretary = mess?.secretaryId
    ? await db.collection("users").findOne({
        _id: new ObjectId(mess.secretaryId),
        role: "MESS_SECRETARY",
      })
    : null;

  const pmc = mess?.pmcId
    ? await db
        .collection("users")
        .findOne({ _id: new ObjectId(mess.pmcId), role: "PMC" })
    : null;

  return { mess, secretary, pmc };
};

const buildReceiptPdf = (bill, { mess, secretary, pmc }) => {
  const commands = [];
  const secretaryName = signatureName(secretary);
  const pmcName = signatureName(pmc);
  const address =
    [mess?.address, mess?.city, mess?.state].filter(Boolean).join(", ") || "—";
  const days = Math.max(1, Number(bill.nights || 1));
  const category = text(
    String(bill.stayCategory || "").replaceAll("_", " "),
    "—",
  );

  // Filter for stay/room/child items only
  const stayItems = (bill.items || []).filter(
    (item) => !String(item.description || "").toLowerCase().includes("messing"),
  );
  const stayTotal = stayItems.length
    ? stayItems.reduce((acc, it) => acc + Number(it.amount || 0), 0)
    : Number(bill.totalAmount || 0) - Number(bill.totalMealAmount || 0);

  rect(commands, 28, 28, 539, 786, 1.5);
  rect(commands, 36, 36, 523, 770, 0.6);

  fillRect(commands, 42, 705, 511, 99, 0.93);
  addText(commands, 155, 780, "AIRFORCE OFFICERS MESS", 21, true);
  addText(commands, 232, 756, text(mess?.name, "OFFICERS MESS"), 14, true);
  addText(commands, 253, 738, address, 9);
  line(commands, 58, 722, 537, 722, 1.5);

  addText(commands, 58, 684, "STAY RECEIPT", 17, true);
  addText(commands, 58, 666, "ACCOMMODATION PAYMENT ACKNOWLEDGEMENT", 7.5);
  fillRect(commands, 385, 650, 152, 48, 0.96);
  addText(
    commands,
    398,
    680,
    `Receipt No: ${text(bill.receiptNumber)}`,
    8.5,
    true,
  );
  addText(commands, 398, 663, `Invoice No: ${text(bill.invoiceNumber)}`, 8.5);
  addText(
    commands,
    398,
    646,
    `Bill Date: ${safeDate(bill.paidAt || bill.createdAt)}`,
    8.5,
  );

  fillRect(commands, 58, 530, 479, 101, 0.97);
  rect(commands, 58, 530, 479, 101, 0.8);
  addText(commands, 70, 610, "OFFICER / GUEST DETAILS", 10.5, true);
  line(commands, 70, 600, 525, 600, 0.5);
  addText(commands, 70, 580, `Rank: ${text(bill.booker?.rank)}`, 9.5);
  addText(commands, 300, 580, `Name: ${text(bill.booker?.name)}`, 9.5);
  addText(
    commands,
    70,
    560,
    `Service No: ${text(bill.booker?.serviceId)}`,
    9.5,
  );
  addText(commands, 300, 560, `Category: ${category}`, 9.5);
  addText(
    commands,
    70,
    540,
    `Date of Bill: ${safeDate(bill.paidAt || bill.createdAt)}`,
    9.5,
  );

  fillRect(commands, 58, 454, 479, 60, 0.97);
  rect(commands, 58, 454, 479, 60, 0.8);
  addText(commands, 70, 496, "STAY DETAILS", 10.5, true);
  line(commands, 70, 486, 525, 486, 0.5);
  addText(commands, 70, 468, `Check-in: ${text(bill.checkInDate)}`, 9.5);
  addText(
    commands,
    285,
    468,
    `Checkout: ${text(bill.actualCheckOutDate || bill.scheduledCheckOutDate)}`,
    9.5,
  );
  addText(commands, 70, 455, `Room: ${text(bill.roomNumber)}`, 9.5);
  addText(commands, 285, 455, `Chargeable Days: ${days}`, 9.5);

  addText(commands, 58, 430, "ROOM RENT CHARGES", 11, true);
  rect(commands, 58, 300, 479, 116, 0.9);
  fillRect(commands, 59, 390, 477, 25, 0.94);
  line(commands, 58, 390, 537, 390, 0.8);
  line(commands, 325, 300, 325, 416, 0.6);
  line(commands, 405, 300, 405, 416, 0.6);
  line(commands, 470, 300, 470, 416, 0.6);
  addText(commands, 70, 398, "Description", 9, true);
  addText(commands, 342, 398, "Days", 9, true);
  addText(commands, 420, 398, "Rate", 9, true);
  addText(commands, 482, 398, "Amount", 9, true);

  const items = stayItems.length
    ? stayItems
    : [
        {
          description: "Room rent charges",
          quantity: days,
          rate: days ? stayTotal / days : stayTotal,
          amount: stayTotal,
        },
      ];

  let y = 370;
  for (const item of items.slice(0, 4)) {
    addText(commands, 70, y, text(item.description, "Room rent charges"), 8.7);
    addText(commands, 342, y, String(item.quantity ?? days), 8.7);
    addText(commands, 420, y, `INR ${money(item.rate)}`, 8.7);
    addText(commands, 482, y, `INR ${money(item.amount)}`, 8.7);
    y -= 19;
  }

  fillRect(commands, 300, 241, 237, 45, 0.91);
  rect(commands, 300, 241, 237, 45, 1.2);
  addText(commands, 314, 268, "STAY AMOUNT PAID", 9.5, true);
  addText(commands, 438, 249, `INR ${money(stayTotal)}`, 15, true);

  fillRect(commands, 58, 172, 479, 52, 0.97);
  rect(commands, 58, 172, 479, 52, 0.8);
  addText(commands, 70, 208, "PAYMENT DETAILS", 10, true);
  addText(commands, 70, 191, `Payment ID: ${text(bill.paymentId)}`, 8.5);
  addText(
    commands,
    300,
    191,
    `Payment Date: ${safeDateTime(bill.paidAt)}`,
    8.5,
  );
  addText(
    commands,
    70,
    178,
    `Payment Mode: ${text(bill.paymentMode, "RAZORPAY / UPI")}   |   Status: PAID`,
    8.5,
    true,
  );

  addText(commands, 58, 148, "ELECTRONIC AUTHORIZATION", 9.5, true);
  line(commands, 58, 143, 537, 143, 0.8);

  fillRect(commands, 58, 70, 222, 62, 0.98);
  rect(commands, 58, 70, 222, 62, 0.7);
  addItalicText(commands, 78, 108, secretaryName, 15);
  addText(commands, 70, 91, "Electronically Signed", 7.5, true);
  addText(
    commands,
    70,
    79,
    `Mess Secretary | ${safeDateTime(bill.paidAt)}`,
    7.2,
  );

  fillRect(commands, 315, 70, 222, 62, 0.98);
  rect(commands, 315, 70, 222, 62, 0.7);
  addItalicText(commands, 335, 108, pmcName, 15);
  addText(commands, 327, 91, "Electronically Signed", 7.5, true);
  addText(commands, 327, 79, `PMC | ${safeDateTime(bill.paidAt)}`, 7.2);

  addText(
    commands,
    58,
    49,
    "Computer-generated accommodation stay receipt. Issued after successful payment verification.",
    6.8,
  );
  return makePdf(commands);
};

const buildMealReceiptPdf = (bill, { mess, secretary, pmc }) => {
  const commands = [];
  const secretaryName = signatureName(secretary);
  const pmcName = signatureName(pmc);
  const address =
    [mess?.address, mess?.city, mess?.state].filter(Boolean).join(", ") || "—";
  const totalMeals = Number(bill.totalMealAmount || 0);
  const md = bill.mealDetails || {};

  rect(commands, 28, 28, 539, 786, 1.5);
  rect(commands, 36, 36, 523, 770, 0.6);

  fillRect(commands, 42, 705, 511, 99, 0.93);
  addText(commands, 155, 780, "AIRFORCE OFFICERS MESS", 21, true);
  addText(commands, 232, 756, text(mess?.name, "OFFICERS MESS"), 14, true);
  addText(commands, 253, 738, address, 9);
  line(commands, 58, 722, 537, 722, 1.5);

  addText(commands, 58, 684, "MESSING / MEAL RECEIPT", 17, true);
  addText(commands, 58, 666, "OFFICIAL MESS CATERING RECEIPT", 7.5);
  fillRect(commands, 385, 650, 152, 48, 0.96);
  addText(
    commands,
    398,
    680,
    `Mess Rec No: ${text(bill.mealReceiptNumber || bill.receiptNumber)}`,
    8.5,
    true,
  );
  addText(commands, 398, 663, `Invoice No: ${text(bill.invoiceNumber)}`, 8.5);
  addText(
    commands,
    398,
    646,
    `Bill Date: ${safeDate(bill.paidAt || bill.createdAt)}`,
    8.5,
  );

  fillRect(commands, 58, 530, 479, 101, 0.97);
  rect(commands, 58, 530, 479, 101, 0.8);
  addText(commands, 70, 610, "OFFICER / GUEST DETAILS", 10.5, true);
  line(commands, 70, 600, 525, 600, 0.5);
  addText(commands, 70, 580, `Rank: ${text(bill.booker?.rank)}`, 9.5);
  addText(commands, 300, 580, `Name: ${text(bill.booker?.name)}`, 9.5);
  addText(
    commands,
    70,
    560,
    `Service No: ${text(bill.booker?.serviceId)}`,
    9.5,
  );
  addText(commands, 300, 560, `Room: ${text(bill.roomNumber)}`, 9.5);
  addText(
    commands,
    70,
    540,
    `Date of Bill: ${safeDate(bill.paidAt || bill.createdAt)}`,
    9.5,
  );

  addText(commands, 58, 500, "MESSING CONSUMPTION BREAKDOWN", 11, true);
  rect(commands, 58, 330, 479, 155, 0.9);
  fillRect(commands, 59, 460, 477, 25, 0.94);
  line(commands, 58, 460, 537, 460, 0.8);
  line(commands, 325, 330, 325, 485, 0.6);
  line(commands, 405, 330, 405, 485, 0.6);
  line(commands, 470, 330, 470, 485, 0.6);
  addText(commands, 70, 468, "Meal Service", 9, true);
  addText(commands, 342, 468, "Meals", 9, true);
  addText(commands, 420, 468, "Rate", 9, true);
  addText(commands, 482, 468, "Amount", 9, true);

  const mealRows = [
    {
      label: "Breakfast (Mess Dining)",
      count: md.breakfast?.count ?? 0,
      rate: md.breakfast?.rate ?? 150,
      amount: md.breakfast?.amount ?? 0,
    },
    {
      label: "Lunch (Mess Dining)",
      count: md.lunch?.count ?? 0,
      rate: md.lunch?.rate ?? 250,
      amount: md.lunch?.amount ?? 0,
    },
    {
      label: "Dinner (Mess Dining)",
      count: md.dinner?.count ?? 0,
      rate: md.dinner?.rate ?? 250,
      amount: md.dinner?.amount ?? 0,
    },
  ];

  let y = 435;
  for (const row of mealRows) {
    addText(commands, 70, y, row.label, 9);
    addText(commands, 342, y, String(row.count), 9);
    addText(commands, 420, y, `INR ${money(row.rate)}`, 9);
    addText(commands, 482, y, `INR ${money(row.amount)}`, 9);
    y -= 25;
  }

  fillRect(commands, 300, 260, 237, 45, 0.91);
  rect(commands, 300, 260, 237, 45, 1.2);
  addText(commands, 314, 287, "TOTAL MESSING PAID", 9.5, true);
  addText(commands, 438, 268, `INR ${money(totalMeals)}`, 15, true);

  fillRect(commands, 58, 172, 479, 52, 0.97);
  rect(commands, 58, 172, 479, 52, 0.8);
  addText(commands, 70, 208, "PAYMENT DETAILS", 10, true);
  addText(commands, 70, 191, `Payment ID: ${text(bill.paymentId)}`, 8.5);
  addText(
    commands,
    300,
    191,
    `Payment Date: ${safeDateTime(bill.paidAt)}`,
    8.5,
  );
  addText(
    commands,
    70,
    178,
    `Payment Mode: ${text(bill.paymentMode, "RAZORPAY / UPI")}   |   Status: PAID`,
    8.5,
    true,
  );

  addText(commands, 58, 148, "ELECTRONIC AUTHORIZATION", 9.5, true);
  line(commands, 58, 143, 537, 143, 0.8);

  fillRect(commands, 58, 70, 222, 62, 0.98);
  rect(commands, 58, 70, 222, 62, 0.7);
  addItalicText(commands, 78, 108, secretaryName, 15);
  addText(commands, 70, 91, "Electronically Signed", 7.5, true);
  addText(
    commands,
    70,
    79,
    `Mess Secretary | ${safeDateTime(bill.paidAt)}`,
    7.2,
  );

  fillRect(commands, 315, 70, 222, 62, 0.98);
  rect(commands, 315, 70, 222, 62, 0.7);
  addItalicText(commands, 335, 108, pmcName, 15);
  addText(commands, 327, 91, "Electronically Signed", 7.5, true);
  addText(commands, 327, 79, `PMC | ${safeDateTime(bill.paidAt)}`, 7.2);

  addText(
    commands,
    58,
    49,
    "Computer-generated messing / catering receipt. Electronic authorization confirms messing charges settlement.",
    6.8,
  );
  return makePdf(commands);
};


const buildInvoicePdf = (bill, context) => {
  const { mess, secretary, pmc } = context;
  const commands = [];
  rect(commands, 32, 32, 531, 778, 1.2);
  addText(commands, 60, 775, "AIRFORCE OFFICERS MESS", 19, true);
  addText(commands, 60, 754, text(mess?.name, "Officers Mess"), 13, true);
  addText(
    commands,
    60,
    736,
    [mess?.address, mess?.city, mess?.state].filter(Boolean).join(", ") || "—",
    9,
  );
  line(commands, 50, 718, 545, 718, 1.4);
  addText(commands, 60, 692, "FINAL INVOICE", 15, true);
  addText(
    commands,
    380,
    692,
    `Invoice No: ${text(bill.invoiceNumber)}`,
    9.5,
    true,
  );
  addText(
    commands,
    380,
    676,
    `Date: ${safeDate(bill.paidAt || bill.createdAt)}`,
    9.5,
  );
  addText(commands, 60, 650, `Rank: ${text(bill.booker?.rank)}`, 10);
  addText(commands, 280, 650, `Name: ${text(bill.booker?.name)}`, 10);
  addText(commands, 60, 630, `Service No: ${text(bill.booker?.serviceId)}`, 10);
  addText(commands, 280, 630, `Room: ${text(bill.roomNumber)}`, 10);
  addText(commands, 60, 610, `Check-in: ${text(bill.checkInDate)}`, 10);
  addText(
    commands,
    280,
    610,
    `Checkout: ${text(bill.actualCheckOutDate || bill.scheduledCheckOutDate)}`,
    10,
  );
  addText(commands, 60, 580, "Room Rent Charges", 11, true);
  addText(
    commands,
    380,
    580,
    `Days: ${Math.max(1, Number(bill.nights || 1))}`,
    10,
    true,
  );
  line(commands, 50, 568, 545, 568, 0.8);

  let y = 545;
  for (const item of (bill.items || []).slice(0, 10)) {
    addText(commands, 60, y, text(item.description), 9);
    addText(commands, 320, y, `Qty: ${item.quantity ?? 1}`, 9);
    addText(commands, 445, y, `₹${money(item.amount)}`, 9);
    y -= 22;
  }

  line(commands, 50, 315, 545, 315, 1);
  addText(commands, 350, 288, `Subtotal: ₹${money(bill.subtotal)}`, 10);
  addText(commands, 350, 270, `Tax: ₹${money(bill.tax)}`, 10);
  addText(commands, 350, 246, `TOTAL: ₹${money(bill.totalAmount)}`, 14, true);
  addText(
    commands,
    50,
    205,
    `Payment Status: ${text(bill.paymentStatus)}`,
    10,
    true,
  );
  addText(commands, 50, 187, `Payment ID: ${text(bill.paymentId)}`, 8.5);
  addText(commands, 50, 169, `Mess Secretary: ${text(secretary?.name)}`, 8.5);
  addText(commands, 50, 151, `PMC: ${text(pmc?.name)}`, 8.5);
  addText(
    commands,
    50,
    70,
    "This is a computer-generated final invoice for Officers Mess accommodation expenses.",
    7.5,
  );
  return makePdf(commands);
};

/**
 * Retrieve bill by billId with authorization check.
 */
export const getBill = async (req, res) => {
  try {
    const { billId } = req.params;
    if (!ObjectId.isValid(billId))
      return res.status(400).json({ message: "Invalid bill ID" });
    const db = getDB();
    const bill = await db
      .collection("bills")
      .findOne({ _id: new ObjectId(billId) });
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (
      req.user.role === "USER" &&
      (!bill.userId || bill.userId.toString() !== req.user.id)
    ) {
      return res.status(403).json({ message: "Access denied" });
    }
    if (["MESS_MANAGER", "MESS_SECRETARY", "PMC"].includes(req.user.role)) {
      const user = await db
        .collection("users")
        .findOne({ _id: new ObjectId(req.user.id) });
      if (user?.messId?.toString() !== bill.messId?.toString()) {
        return res.status(403).json({ message: "Access denied" });
      }
    }
    res.json(bill);
  } catch (error) {
    console.error("GET BILL ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all bills for the authenticated user.
 */
export const getMyBills = async (req, res) => {
  try {
    const db = getDB();
    const bills = await db
      .collection("bills")
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(bills);
  } catch (error) {
    console.error("GET MY BILLS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Create a real Razorpay order on the server.
 * The secret key never leaves the backend.
 */
export const createPaymentOrder = async (req, res) => {
  try {
    const { billId } = req.params;
    if (!ObjectId.isValid(billId))
      return res.status(400).json({ message: "Invalid bill ID" });

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return res.status(503).json({
        message:
          "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env.",
      });
    }

    const db = getDB();
    const bill = await getBillForUser(db, billId, req.user.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    if (bill.paymentStatus === "PAID")
      return res.status(400).json({ message: "Bill is already paid" });

    const amount = Number(bill.totalAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid bill amount" });
    }

    const receipt = `bill_${String(bill._id).slice(-18)}_${Date.now()}`;
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt,
        notes: {
          billId: String(bill._id),
          bookingId: String(bill.bookingId || ""),
          userId: String(req.user.id),
        },
      }),
    });

    const order = await razorpayResponse.json();
    if (!razorpayResponse.ok || !order?.id) {
      console.error("RAZORPAY ORDER ERROR:", order);
      return res.status(502).json({
        message: order?.error?.description || "Unable to create Razorpay order",
      });
    }

    await db.collection("bills").updateOne(
      { _id: bill._id, userId: new ObjectId(req.user.id), paymentStatus: { $ne: "PAID" } },
      {
        $set: {
          razorpayOrderId: order.id,
          paymentStatus: "PAYMENT_PROCESSING",
          paymentMode: "RAZORPAY",
          razorpayAmount: order.amount,
          razorpayCurrency: order.currency,
          updatedAt: new Date(),
        },
      },
    );

    res.json({
      message: "Razorpay order created",
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
      mode: "RAZORPAY",
    });
  } catch (error) {
    console.error("CREATE RAZORPAY ORDER ERROR:", error);
    res.status(500).json({ message: "Unable to start Razorpay payment" });
  }
};

/**
 * Verify Razorpay Checkout signature server-side and settle the bill.
 */
export const verifyPayment = async (req, res) => {
  try {
    const {
      billId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = req.body || {};

    if (!billId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({ message: "Payment verification information is incomplete" });
    }
    if (!ObjectId.isValid(billId))
      return res.status(400).json({ message: "Invalid bill ID" });

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret)
      return res.status(503).json({ message: "Razorpay secret is not configured on the server" });

    const db = getDB();
    const bill = await getBillForUser(db, billId, req.user.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    if (bill.paymentStatus === "PAID") {
      return res.json({ message: "Payment already completed", paymentStatus: "PAID", bill });
    }
    if (bill.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ message: "Razorpay order does not match this bill" });
    }

    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${bill.razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    const receivedSignature = String(razorpaySignature);
    const signaturesMatch =
      receivedSignature.length === generatedSignature.length &&
      crypto.timingSafeEqual(
        Buffer.from(generatedSignature, "utf8"),
        Buffer.from(receivedSignature, "utf8"),
      );
    if (!signaturesMatch) {
      await db.collection("bills").updateOne(
        { _id: bill._id },
        { $set: { paymentStatus: "PAYMENT_FAILED", updatedAt: new Date() } },
      );
      return res.status(400).json({ message: "Invalid Razorpay payment signature" });
    }

    // Confirm the payment status with Razorpay before marking the bill as paid.
    const keyId = process.env.RAZORPAY_KEY_ID;
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId)}`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) {
      console.error("RAZORPAY PAYMENT FETCH ERROR:", payment);
      return res.status(502).json({ message: "Unable to confirm Razorpay payment status" });
    }
    if (payment.order_id !== bill.razorpayOrderId) {
      return res.status(400).json({ message: "Payment order mismatch" });
    }
    if (payment.status !== "captured") {
      return res.status(400).json({
        message: `Payment is not captured yet (status: ${payment.status || "unknown"})`,
      });
    }
    if (Number(payment.amount) !== Math.round(Number(bill.totalAmount || 0) * 100)) {
      return res.status(400).json({ message: "Payment amount does not match the bill" });
    }

    const now = new Date();
    const invoiceNumber =
      bill.invoiceNumber || (await nextDocumentNumber(db, "invoice", "INV"));
    const receiptNumber =
      bill.receiptNumber || (await nextDocumentNumber(db, "receipt", "REC"));
    const mealReceiptNumber =
      bill.mealReceiptNumber || (await nextDocumentNumber(db, "meal_receipt", "MREC"));

    const updated = await db.collection("bills").findOneAndUpdate(
      {
        _id: bill._id,
        userId: new ObjectId(req.user.id),
        paymentStatus: { $ne: "PAID" },
      },
      {
        $set: {
          paymentStatus: "PAID",
          paymentMode: payment.method === "upi" ? "RAZORPAY_UPI" : "RAZORPAY",
          paymentId: razorpayPaymentId,
          razorpayOrderId: bill.razorpayOrderId,
          razorpaySignature,
          razorpayMethod: payment.method || null,
          razorpayVpa: payment.vpa || null,
          razorpayFee: Number(payment.fee || 0) / 100,
          razorpayTax: Number(payment.tax || 0) / 100,
          gatewayCharges: Number(payment.fee || 0) / 100,
          paidAt: now,
          invoiceNumber,
          receiptNumber,
          mealReceiptNumber,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    const paidBill = updated?.value || updated;

    await db.collection("payments").updateOne(
      { paymentId: razorpayPaymentId },
      {
        $set: {
          billId: bill._id,
          userId: bill.userId,
          messId: bill.messId,
          orderId: bill.razorpayOrderId,
          paymentId: razorpayPaymentId,
          amount: Number(bill.totalAmount || 0),
          currency: "INR",
          status: "PAID",
          paymentMode: payment.method === "upi" ? "RAZORPAY_UPI" : "RAZORPAY",
          razorpayMethod: payment.method || null,
          razorpayVpa: payment.vpa || null,
          gatewayFee: Number(payment.fee || 0) / 100,
          gatewayTax: Number(payment.tax || 0) / 100,
          netAmount: Number(bill.totalAmount || 0) - Number(payment.fee || 0) / 100,
          paidAt: now,
        },
        $setOnInsert: { createdAt: bill.createdAt || now },
      },
      { upsert: true },
    );

    await broadcastMessEvent(db, {
      messId: bill.messId,
      userId: bill.userId,
      type: "PAYMENT_SUCCESS",
      title: "Payment received",
      billId: bill._id,
      bookingId: bill.bookingId,
      userMessage: `Payment of ₹${money(bill.totalAmount)} was completed successfully. Your paid invoice and receipts are available.`,
      staffMessage: `Payment received: ₹${money(bill.totalAmount)} from ${bill.booker?.name || "guest"}. Booking ${bill.bookingId}. Checkout and payment completed.`,
      notifyUser: true,
    });

    res.json({
      message: "Razorpay payment verified successfully",
      paymentStatus: "PAID",
      bill: paidBill,
    });
  } catch (error) {
    console.error("VERIFY RAZORPAY PAYMENT ERROR:", error);
    res.status(500).json({ message: "Razorpay payment could not be verified" });
  }
};

const sendPdf = async (req, res, kind) => {
  try {
    const { billId } = req.params;
    if (!ObjectId.isValid(billId))
      return res.status(400).json({ message: "Invalid bill ID" });
    const db = getDB();
    const bill = await getBillForUser(db, billId, req.user.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });
    if (bill.paymentStatus !== "PAID") {
      return res.status(400).json({
        message: "Invoice and receipt are available after successful payment",
      });
    }

    const context = await fetchReceiptContext(db, bill);
    let buffer;
    let number;
    let defaultPrefix;

    if (kind === "invoice") {
      buffer = buildInvoicePdf(bill, context);
      number = bill.invoiceNumber;
      defaultPrefix = "invoice";
    } else if (kind === "meal_receipt") {
      buffer = buildMealReceiptPdf(bill, context);
      number = bill.mealReceiptNumber || bill.receiptNumber;
      defaultPrefix = "meal-receipt";
    } else {
      buffer = buildReceiptPdf(bill, context);
      number = bill.receiptNumber;
      defaultPrefix = "stay-receipt";
    }

    const filename = `${number || defaultPrefix}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error(`DOWNLOAD ${kind.toUpperCase()} ERROR:`, error);
    res.status(500).json({ message: `Unable to generate ${kind}` });
  }
};

export const downloadInvoice = (req, res) => sendPdf(req, res, "invoice");
export const downloadReceipt = (req, res) => sendPdf(req, res, "receipt");
export const downloadMealReceipt = (req, res) => sendPdf(req, res, "meal_receipt");

/**
 * Direct bill settlement for offline / demonstration / mess desk payment.
 * Ensures the invoice, stay receipt and meal receipt are generated and the user gets verified receipts.
 */
export const settleDemoPayment = async (req, res) => {
  try {
    const { billId } = req.params;
    if (!ObjectId.isValid(billId))
      return res.status(400).json({ message: "Invalid bill ID" });

    const db = getDB();
    const bill = await getBillForUser(db, billId, req.user.id);
    if (!bill) return res.status(404).json({ message: "Bill not found" });

    if (bill.paymentStatus === "PAID") {
      return res.json({ message: "Bill already settled", paymentStatus: "PAID", bill });
    }

    const now = new Date();
    const invoiceNumber =
      bill.invoiceNumber || (await nextDocumentNumber(db, "invoice", "INV"));
    const receiptNumber =
      bill.receiptNumber || (await nextDocumentNumber(db, "receipt", "REC"));
    const mealReceiptNumber =
      bill.mealReceiptNumber || (await nextDocumentNumber(db, "meal_receipt", "MREC"));
    const demoPaymentId = `pay_mess_demo_${Date.now()}`;

    const updated = await db.collection("bills").findOneAndUpdate(
      {
        _id: bill._id,
        userId: new ObjectId(req.user.id),
        paymentStatus: { $ne: "PAID" },
      },
      {
        $set: {
          paymentStatus: "PAID",
          paymentMode: req.body?.paymentMode || "MESS_COUNTER_DEMO",
          paymentId: demoPaymentId,
          paidAt: now,
          invoiceNumber,
          receiptNumber,
          mealReceiptNumber,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    const paidBill = updated?.value || updated;

    await db.collection("payments").updateOne(
      { paymentId: demoPaymentId },
      {
        $set: {
          billId: bill._id,
          userId: bill.userId,
          messId: bill.messId,
          orderId: `ord_mess_${Date.now()}`,
          paymentId: demoPaymentId,
          amount: Number(bill.totalAmount || 0),
          currency: "INR",
          status: "PAID",
          paymentMode: req.body?.paymentMode || "MESS_COUNTER_DEMO",
          netAmount: Number(bill.totalAmount || 0),
          paidAt: now,
        },
        $setOnInsert: { createdAt: bill.createdAt || now },
      },
      { upsert: true },
    );

    await broadcastMessEvent(db, {
      messId: bill.messId,
      userId: bill.userId,
      type: "PAYMENT_SUCCESS",
      title: "Payment completed",
      billId: bill._id,
      bookingId: bill.bookingId,
      userMessage: `Payment of ₹${money(bill.totalAmount)} was completed. Your invoice (${invoiceNumber}), stay receipt (${receiptNumber}), and meal receipt (${mealReceiptNumber}) are now available.`,
      staffMessage: `Payment received: ₹${money(bill.totalAmount)} from ${bill.booker?.name || "guest"}. Booking ${bill.bookingId}. Checkout and payment completed.`,
      notifyUser: true,
    });

    res.json({
      message: "Bill payment settled successfully",
      paymentStatus: "PAID",
      bill: paidBill,
    });
  } catch (error) {
    console.error("SETTLE DEMO PAYMENT ERROR:", error);
    res.status(500).json({ message: "Unable to settle bill payment" });
  }
};

