import React, { useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";
import { Page, Card, Alert, Badge, Empty } from "../components/UI";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { dateOnly, fmtDate } from "../constants";

const addDays = (value, count) => {
  const date = dateOnly(value);
  if (!date) return "";
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + count))
    .toISOString()
    .slice(0, 10);
};

const displayCheckout = (bill) => {
  const checkout = dateOnly(
    bill.actualCheckOutDate || bill.scheduledCheckOutDate,
  );
  const checkin = dateOnly(bill.checkInDate);
  const nights = Math.max(0, Number(bill.nights || 0));
  // Normalise legacy bills that stored a same-day physical checkout even
  // though their bill correctly represents one or more accommodation nights.
  return checkout && checkin && checkout <= checkin && nights
    ? addDays(checkin, nights)
    : checkout;
};

const downloadFile = async (url, filename) => {
  const response = await api.get(url, { responseType: "blob" });
  const blobUrl = window.URL.createObjectURL(response.data);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
};

const loadRazorpay = () =>
  new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Razorpay), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay Checkout")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error("Unable to load Razorpay Checkout"));
    document.body.appendChild(script);
  });

export default function Bills() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("ALL"); // ALL, PENDING, PAID
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState("");
  const [paymentTransition, setPaymentTransition] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/payments/bills/my");
      setItems(r.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pay = async (bill) => {
    try {
      setErr("");
      setPaymentSuccess("");
      setBusy(String(bill._id));

      // Play payment.lottie for 5.5 seconds before redirecting to Razorpay checkout
      setPaymentTransition(true);
      await new Promise((resolve) => setTimeout(resolve, 5500));
      setPaymentTransition(false);

      const Razorpay = await loadRazorpay();
      const r = await api.post(`/payments/bills/${bill._id}/order`);
      const user = (() => {
        try {
          return JSON.parse(localStorage.getItem("om_user") || "null") || {};
        } catch {
          return {};
        }
      })();

      const options = {
        key: r.data.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: r.data.amount,
        currency: r.data.currency || "INR",
        name: "Airforce Officers Mess",
        description: `Final stay bill ${String(bill._id)}`,
        order_id: r.data.orderId,
        prefill: {
          name: user.name || bill.booker?.name || "",
          email: user.email || bill.booker?.email || "",
          contact: user.phone || user.mobile || bill.booker?.phone || "",
        },
        notes: {
          billId: String(bill._id),
          bookingId: String(bill.bookingId || ""),
        },
        config: {
          display: {
            blocks: {
              banks: {
                name: "Pay via UPI or other methods",
                instruments: [
                  { method: "upi" },
                  { method: "card" },
                  { method: "netbanking" },
                  { method: "wallet" },
                ],
              },
            },
            sequence: ["block.banks"],
            preferences: { show_default_blocks: false },
          },
        },
        theme: { color: "#111827" },
        handler: async (response) => {
          try {
            await api.post("/payments/verify", {
              billId: bill._id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            await load();
            setPaymentSuccess("Payment verified successfully. Your invoice and receipt are now available.");
          } catch (e) {
            setErr(errorMessage(e));
          } finally {
            setBusy("");
          }
        },
        modal: {
          ondismiss: () => setBusy(""),
        },
      };

      if (!options.key) {
        throw new Error("Razorpay Key ID is missing. Add VITE_RAZORPAY_KEY_ID to frontend/.env.");
      }

      const checkout = new Razorpay(options);
      checkout.on("payment.failed", (response) => {
        setBusy("");
        setErr(response?.error?.description || "Razorpay payment failed. Please try again.");
      });
      checkout.open();
    } catch (e) {
      setPaymentTransition(false);
      setBusy("");
      setErr(errorMessage(e));
    }
  };

  const settleDemo = async (bill) => {
    try {
      setErr("");
      setPaymentSuccess("");
      setBusy(String(bill._id));
      await api.post(`/payments/bills/${bill._id}/settle-demo`, {
        paymentMode: "DEMO_INSTANT",
      });
      await load();
      setPaymentSuccess("Payment recorded successfully. Your paid invoice and receipt are now available.");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy("");
    }
  };

  const download = async (bill, type) => {
    try {
      setErr("");
      setBusy(`${type}-${bill._id}`);
      let filenameNumber = bill.receiptNumber;
      if (type === "invoice") {
        filenameNumber = bill.invoiceNumber;
      } else if (type === "meal-receipt") {
        filenameNumber = bill.mealReceiptNumber || bill.receiptNumber;
      }
      await downloadFile(
        `/payments/bills/${bill._id}/${type}`,
        `${filenameNumber || type}.pdf`,
      );
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy("");
    }
  };

  const pendingBills = items.filter((b) => b.paymentStatus !== "PAID");
  const paidBills = items.filter((b) => b.paymentStatus === "PAID");

  const displayedBills = items.filter((b) => {
    if (tab === "PENDING") return b.paymentStatus !== "PAID";
    if (tab === "PAID") return b.paymentStatus === "PAID";
    return true;
  });

  return (
    <>
      {paymentTransition ? (
        <div className="om-lottie-overlay om-lottie-overlay-payment" role="status" aria-live="polite">
          <div className="om-lottie-box om-payment-lottie-box">
            <DotLottieReact src="/payment.lottie" autoplay loop />
          </div>
          <div className="om-lottie-title">Opening Secure Gateway…</div>
          <div className="om-lottie-subtitle">Connecting to Razorpay payment network.</div>
        </div>
      ) : (
      <Page
        title="Bills & Payments"
        subtitle="Manage accommodation invoices, view pending payments, and download official receipts."
      >
        {err && <Alert>{err}</Alert>}
        {paymentSuccess && <Alert type="success">{paymentSuccess}</Alert>}

        {/* SECTION TABS: ALL / PENDING / PAYMENTS MADE */}
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
          <ul className="nav nav-pills om-bill-tabs">
            <li className="nav-item">
              <button
                className={`nav-link ${tab === "ALL" ? "active" : ""}`}
                onClick={() => setTab("ALL")}
              >
                All Bills ({items.length})
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${tab === "PENDING" ? "active" : ""}`}
                onClick={() => setTab("PENDING")}
              >
                Pending Payment
                {pendingBills.length > 0 && (
                  <span className="badge bg-danger ms-2">{pendingBills.length}</span>
                )}
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${tab === "PAID" ? "active" : ""}`}
                onClick={() => setTab("PAID")}
              >
                Payments Made ({paidBills.length})
              </button>
            </li>
          </ul>

          <div className="d-flex align-items-center gap-2">
            <span className="small text-secondary">Showing:</span>
            <span className="badge bg-dark px-3 py-2">
              {tab === "ALL" ? "All Records" : tab === "PENDING" ? "Pending Bills" : "Paid Invoices"}
            </span>
          </div>
        </div>

        {/* BILL PAYMENT NOTIFICATION BANNER */}
        {pendingBills.length > 0 && tab !== "PAID" && (
          <div className="alert alert-danger d-flex justify-content-between align-items-center mb-4 shadow-sm border-0 border-start border-danger border-4">
            <div className="d-flex align-items-center gap-3">
              <i className="bi bi-exclamation-octagon-fill fs-3 text-danger"></i>
              <div>
                <strong className="text-danger fs-6">
                  {pendingBills.length} bill payment pending
                </strong>
                <div className="text-secondary small mt-1">
                  Your checkout is completed. Please complete payment to receive your official paid invoice and receipt.
                </div>
              </div>
            </div>
            <button
              className="btn btn-sm btn-danger px-3 py-2 fw-semibold"
              onClick={() => setTab("PENDING")}
            >
              Review Pending ({pendingBills.length})
            </button>
          </div>
        )}

      <div className="row g-3">
        {displayedBills.map((b) => (
          <div className="col-lg-6" key={String(b._id)}>
            <Card className={b.paymentStatus === "PAID" ? "om-bill-paid-card" : "om-bill-pending-card border-start border-4 border-warning"}>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5 className="mb-1">Final Stay Bill</h5>
                  <small className="text-secondary">
                    Bill ID: {String(b._id)}
                  </small>
                </div>
                <Badge
                  type={
                    b.paymentStatus === "PAID"
                      ? "payment-complete"
                      : "payment-pending"
                  }
                >
                  {b.paymentStatus === "PAID" ? "PAYMENT COMPLETED" : "PAYMENT PENDING"}
                </Badge>
              </div>

              <div className="display-6 mt-3 text-dark fw-bold">
                ₹{Number(b.totalAmount || 0).toFixed(2)}
              </div>
              <div className="small text-secondary mt-2">
                {fmtDate(b.checkInDate)} → {fmtDate(displayCheckout(b))} ·{" "}
                {b.nights || 0} {(b.nights || 0) === 1 ? "night" : "nights"}
              </div>

              {b.paymentStatus !== "PAID" ? (
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <button
                    className="btn btn-dark"
                    disabled={busy === String(b._id)}
                    onClick={() => pay(b)}
                  >
                    <i className="bi bi-credit-card me-2" />
                    {busy === String(b._id)
                      ? "Processing payment…"
                      : "Pay securely with Razorpay"}
                  </button>
                  <button
                    className="btn btn-outline-primary"
                    disabled={busy === String(b._id)}
                    onClick={() => settleDemo(b)}
                    title="Instantly mark as paid for demonstration or cash desk collection"
                  >
                    <i className="bi bi-check-circle me-2" />
                    Complete Demo Payment
                  </button>
                </div>
              ) : (
                <div className="mt-3">
                  <div className="alert alert-success py-2 mb-3">
                    Payment successful. Invoice:{" "}
                    <strong>{b.invoiceNumber}</strong> · Stay Receipt:{" "}
                    <strong>{b.receiptNumber}</strong>
                    {b.mealReceiptNumber && (
                      <>
                        {" "}· Mess Receipt: <strong>{b.mealReceiptNumber}</strong>
                      </>
                    )}
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      className="btn btn-dark"
                      disabled={busy === `invoice-${b._id}`}
                      onClick={() => download(b, "invoice")}
                    >
                      <i className="bi bi-file-earmark-pdf me-2" />
                      Download Invoice
                    </button>
                    <button
                      className="btn btn-outline-dark"
                      disabled={busy === `receipt-${b._id}`}
                      onClick={() => download(b, "receipt")}
                    >
                      <i className="bi bi-receipt me-2" />
                      Stay Receipt
                    </button>
                    <button
                      className="btn btn-outline-success"
                      disabled={busy === `meal-receipt-${b._id}`}
                      onClick={() => download(b, "meal-receipt")}
                    >
                      <i className="bi bi-cup-hot me-2" />
                      Meal Receipt
                    </button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        ))}
      </div>
      {!displayedBills.length && !err && (
        <Empty
          text={
            tab === "PENDING"
              ? "No pending bill payments. All cleared!"
              : tab === "PAID"
                ? "No completed payments yet."
                : "No bills available."
          }
        />
      )}
    </Page>
      )}
    </>
  );
}
