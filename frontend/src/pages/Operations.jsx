import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { RejectBookingModal } from "./Requests";
import {
  categoryName,
  fmtDate,
  localDate,
  dateOnly,
  calculateNights,
} from "../constants";
import { Page, Card, Alert, Badge, Field, Empty, TableLoading } from "../components/UI";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { exportToExcel, exportRevenueToExcel } from "../utils/excelExport";

/* =========================================================
   ROOM RATES
========================================================= */

const RATE = {
  TD_OFFICER: 2800,
  OFFICER_LEAVE: 1000,
  OFFICER_GUEST: 1000,
  DEPENDANT_GUEST: 1000,
};

/* =========================================================
   OCCUPANCY
========================================================= */

function Occupancy({ onSelectBooking, refreshTrigger = 0 }) {
  const [month, setMonth] = useState(localDate().slice(0, 7));

  const [data, setData] = useState(null);

  const [loading, setLoading] = useState(false);

  const loadOccupancy = async () => {
    try {
      setLoading(true);

      const response = await api.get("/rooms/occupancy", {
        params: {
          month,
        },
      });

      setData(response.data);
    } catch (error) {
      console.error("Unable to load occupancy:", error);
    } finally {
      setLoading(false);
    }
  };

  /*
   * Load occupancy on mount, month change, or explicit refreshTrigger after check-in/checkout.
   */
  useEffect(() => {
    loadOccupancy();
  }, [month, refreshTrigger]);

  const today = localDate();

  return (
    <Card className="occupancy-card">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div className="section-kicker">
            <h5>Live Operations</h5>
          </div>

          <h5 className="mb-1">Monthly occupancy</h5>

          <small className="text-secondary">
            🟢 Reserved · 🔵 Checked in · ⚪ Available ·{" "}
            <span className="today-key">Today</span>
          </small>
        </div>

        <div className="d-flex align-items-center gap-2">
          {loading && <span className="small text-secondary">Updating...</span>}

          <input
            type="month"
            className="form-control"
            style={{
              maxWidth: 180,
            }}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
      </div>

      <div className="occupancy">
        <TableLoading loading={loading}>
          <table className="table table-bordered occupancy-table">
            <colgroup>
              <col className="occupancy-room-col" style={{ width: "75px" }} />

              {(data?.days || []).map((date) => (
                <col
                  key={`col-${date}`}
                  className="occupancy-date-col"
                  style={{ width: "66px" }}
                />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th>
                  Date
                  <br />
                  &<br />
                  Room
                </th>

                {(data?.days || []).map((date) => (
                  <th
                    key={date}
                    className={date === today ? "occupancy-today" : ""}
                  >
                    {date.slice(-2)}

                    {date === today && <small className="d-block">TODAY</small>}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {(data?.rooms || []).map((room) => {
                const roomCells = [];

                let index = 0;

                while (index < (data?.days || []).length) {
                  const date = data.days[index];

                  const cell = (data?.cells || []).find(
                    (item) =>
                      String(item.roomId) === String(room._id) &&
                      item.date === date,
                  );

                  const status = cell?.status || "AVAILABLE";

                  const bookingId = cell?.bookingId
                    ? String(cell.bookingId)
                    : null;

                  /*
                   * ONE BOOKING = ONE CONTINUOUS BLOCK
                   *
                   * Primary key: bookingId.
                   * Fallback: guestName + status for
                   * older occupancy records which may
                   * not contain bookingId.
                   */
                  const blockKey = bookingId
                    ? `BOOKING:${bookingId}`
                    : cell?.guestName
                      ? `GUEST:${cell.guestName}|STATUS:${status}`
                      : null;

                  if (blockKey) {
                    let span = 1;

                    while (index + span < data.days.length) {
                      const nextDate = data.days[index + span];

                      const nextCell = (data?.cells || []).find(
                        (item) =>
                          String(item.roomId) === String(room._id) &&
                          item.date === nextDate,
                      );

                      const nextBookingId = nextCell?.bookingId
                        ? String(nextCell.bookingId)
                        : null;

                      const nextStatus = nextCell?.status || "AVAILABLE";

                      const nextBlockKey = nextBookingId
                        ? `BOOKING:${nextBookingId}`
                        : nextCell?.guestName
                          ? `GUEST:${nextCell.guestName}|STATUS:${nextStatus}`
                          : null;

                      if (nextBlockKey === blockKey) {
                        span++;
                      } else {
                        break;
                      }
                    }

                    const containsToday = data.days
                      .slice(index, index + span)
                      .includes(today);

                    roomCells.push(
                      <td
                        key={`${room._id}-${date}`}
                        colSpan={span}
                        className={`
                                                        cell-${String(
                                                          status,
                                                        ).toLowerCase()}

                                                        occupancy-booking-block

                                                        ${
                                                          containsToday
                                                            ? "occupancy-today-cell"
                                                            : ""
                                                        }

                                                        occupancy-clickable
                                                    `}
                        title={cell?.guestName || status}
                        onClick={() => onSelectBooking?.(bookingId)}
                      >
                        <span className="occupancy-guest-name">
                          {cell?.guestName || "Officer"}
                        </span>
                      </td>,
                    );

                    index += span;
                  } else {
                    /*
                     * Available / blocked /
                     * maintenance cells remain
                     * individual.
                     */

                    roomCells.push(
                      <td
                        key={`${room._id}-${date}`}
                        className={`
                                                        cell-${String(
                                                          status,
                                                        ).toLowerCase()}

                                                        ${
                                                          date === today
                                                            ? "occupancy-today-cell"
                                                            : ""
                                                        }
                                                    `}
                        title={status}
                      >
                        {status === "AVAILABLE" ? "" : "·"}
                      </td>,
                    );

                    index++;
                  }
                }

                return (
                  <tr key={String(room._id)}>
                    <th>{room.roomNumber}</th>

                    {roomCells}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableLoading>
      </div>
    </Card>
  );
}

/* =========================================================
   CHECK-IN PANEL
========================================================= */

function CheckInPanel({ booking, onDone }) {
  const [busy, setBusy] = useState(false);

  const [err, setErr] = useState("");

  const [ok, setOk] = useState("");

  if (!booking || booking.status === "CHECKED_IN") {
    return null;
  }

  const today = localDate();

  /*
   * Room is already allocated during
   * Manager approval.
   *
   * Check-in is allowed only on the
   * arrival date.
   */
  const can =
    booking.status === "APPROVED" && dateOnly(booking.checkInDate) === today;

  const check = async () => {
    setBusy(true);
    setErr("");
    setOk("");

    try {
      /*
       * Backend changes:
       *
       * APPROVED -> CHECKED_IN
       *
       * The room was already allotted
       * during approval.
       */

      const response = await api.patch(`/bookings/${booking._id}/check-in`);

      setOk(response.data?.message || "Guest checked in successfully.");

      await onDone?.();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="checkin-panel" className="mt-3 checkin-panel">
      <div className="d-flex justify-content-between">
        <div>
          <div className="section-kicker">
            <div id="arrival-control">
              <h5>Arrival Control</h5>

              {/* existing Arrival Control code */}
            </div>
          </div>

          <h5>{booking.booker?.name || "Guest"}</h5>

          <small className="text-secondary">
            {fmtDate(booking.checkInDate)} → {fmtDate(booking.checkOutDate)}
            <span className="ms-2">
              · {calculateNights(booking.checkInDate, booking.checkOutDate)}{" "}
              night(s)
            </span>
          </small>
        </div>
      </div>

      {err && (
        <div className="mt-3">
          <Alert>{err}</Alert>
        </div>
      )}

      {ok && (
        <div className="mt-3">
          <Alert type="success">{ok}</Alert>
        </div>
      )}

      {booking.status === "CHECKED_IN" ? (
        <div className="text-success fw-semibold mt-3">
          ✓ Guest is currently checked in.
          {booking.roomNumber && (
            <div className="mt-1">
              Room <strong>{booking.roomNumber}</strong> already allotted during
              approval.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="alert alert-info mt-3">
            <strong>Room allocated</strong>

            <div className="small mt-1">
              The system automatically selected the best available room when
              this booking was approved by the Mess Manager.
              {booking.roomNumber && (
                <>
                  {" "}
                  Allocated room: <strong>{booking.roomNumber}</strong>.
                </>
              )}
            </div>
          </div>

          <div className="mt-3 small text-secondary">
            Check-in is permitted only on the arrival date.
          </div>

          <button
            className="btn btn-outline-primary mt-2"
            disabled={!can || busy}
            onClick={check}
          >
            <i className="bi bi-box-arrow-in-right me-2" />

            {busy ? "Checking in..." : "Check in guest"}
          </button>
        </>
      )}
    </Card>
  );
}

/* =========================================================
   CHECKOUT PANEL
========================================================= */

function CheckoutPanel({ booking, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Meal tracking
  const [breakfastCount, setBreakfastCount] = useState(0);
  const [lunchCount, setLunchCount] = useState(0);
  const [dinnerCount, setDinnerCount] = useState(0);
  const [roomRates, setRoomRates] = useState(null);

  useEffect(() => {
    // Fetch room rates for accurate live preview
    const loadRoom = async () => {
      try {
        const res = await api.get("/rooms");
        const found = (res.data?.rooms || []).find(
          (r) =>
            r._id === booking.roomId ||
            String(r.roomNumber) === String(booking.roomNumber),
        );
        if (found) {
          setRoomRates(found);
        }
      } catch (e) {
        console.error("Could not fetch room meal rates:", e);
      }
    };
    if (booking) loadRoom();
  }, [booking]);

  if (
    !booking ||
    !["CHECKED_IN", "CHECKOUT_REQUESTED"].includes(booking.status)
  ) {
    return null;
  }

  const today = localDate();
  const requested = booking.status === "CHECKOUT_REQUESTED";
  const scheduledReached = today >= dateOnly(booking.checkOutDate);
  const can = requested || scheduledReached;

  // Actual checkout date is today (or scheduled date if today is later)
  const actualCheckout = today < dateOnly(booking.checkOutDate) ? today : dateOnly(booking.checkOutDate);
  const rawNights = calculateNights(booking.checkInDate, actualCheckout);
  // If same day check-in and checkout (e.g. 0 nights), standard minimum is 1 night chargeable
  const nights = Math.max(1, rawNights);

  const nightlyRate = Number(
    RATE[booking.stayCategory] ??
      roomRates?.rates?.[booking.stayCategory] ??
      1000,
  );
  const roomCost = nights * nightlyRate;

  const bRate = Number(roomRates?.mealRates?.BREAKFAST ?? 150);
  const lRate = Number(roomRates?.mealRates?.LUNCH ?? 250);
  const dRate = Number(roomRates?.mealRates?.DINNER ?? 250);

  const bTotal = Math.max(0, breakfastCount) * bRate;
  const lTotal = Math.max(0, lunchCount) * lRate;
  const dTotal = Math.max(0, dinnerCount) * dRate;
  const mealCost = bTotal + lTotal + dTotal;
  const grandTotal = roomCost + mealCost;

  const checkout = async () => {
    setBusy(true);
    setErr("");
    setOk("");

    try {
      const response = await api.patch(`/bookings/${booking._id}/check-out`, {
        meals: {
          breakfast: Number(breakfastCount) || 0,
          lunch: Number(lunchCount) || 0,
          dinner: Number(dinnerCount) || 0,
          breakfastRate: bRate,
          lunchRate: lRate,
          dinnerRate: dRate,
        },
      });

      setOk(response.data?.message || "Checkout completed and bill generated.");
      await onDone?.();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card id="checkout-panel" className="mt-3 checkout-panel">
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <div className="section-kicker">
            <h5>Departure Control</h5>
          </div>

          <h5>{booking.booker?.name || "Guest"}</h5>

          <div className="small text-secondary">
            {fmtDate(booking.checkInDate)} → {fmtDate(actualCheckout)} ·{" "}
            {nights} night(s){actualCheckout < dateOnly(booking.checkOutDate) ? ` (Early Checkout · Scheduled: ${fmtDate(booking.checkOutDate)})` : ""} · {categoryName(booking.stayCategory)} · Room {booking.roomNumber || "—"}
          </div>
        </div>
      </div>

      {requested && (
        <div className="alert alert-warning mt-3">
          Guest requested checkout. Record messing charges and confirm stay billing.
        </div>
      )}

      {!requested && !scheduledReached && (
        <div className="alert alert-info mt-3">
          Manager checkout becomes available on {fmtDate(booking.checkOutDate)}.
        </div>
      )}

      {/* Messing / Meal consumption inputs */}
      <div className="border rounded p-3 bg-light mt-3">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong className="text-dark">
            <i className="bi bi-cup-hot me-2" />
            Messing & Catering Consumed
          </strong>
          <small className="text-muted">
            Configured Rates: B: ₹{bRate} | L: ₹{lRate} | D: ₹{dRate}
          </small>
        </div>

        <div className="row g-2">
          <div className="col-md-4">
            <label className="form-label small fw-semibold mb-1">
              Breakfasts (₹{bRate})
            </label>
            <div className="input-group input-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setBreakfastCount((c) => Math.max(0, c - 1))}
              >
                -
              </button>
              <input
                type="number"
                min="0"
                className="form-control text-center"
                value={breakfastCount}
                onChange={(e) =>
                  setBreakfastCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setBreakfastCount((c) => c + 1)}
              >
                +
              </button>
            </div>
            <div className="text-muted small mt-1">₹{bTotal}</div>
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold mb-1">
              Lunches (₹{lRate})
            </label>
            <div className="input-group input-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setLunchCount((c) => Math.max(0, c - 1))}
              >
                -
              </button>
              <input
                type="number"
                min="0"
                className="form-control text-center"
                value={lunchCount}
                onChange={(e) =>
                  setLunchCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setLunchCount((c) => c + 1)}
              >
                +
              </button>
            </div>
            <div className="text-muted small mt-1">₹{lTotal}</div>
          </div>

          <div className="col-md-4">
            <label className="form-label small fw-semibold mb-1">
              Dinners (₹{dRate})
            </label>
            <div className="input-group input-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setDinnerCount((c) => Math.max(0, c - 1))}
              >
                -
              </button>
              <input
                type="number"
                min="0"
                className="form-control text-center"
                value={dinnerCount}
                onChange={(e) =>
                  setDinnerCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                }
              />
              <button
                type="button"
                className="btn btn-outline-secondary"
                onClick={() => setDinnerCount((c) => c + 1)}
              >
                +
              </button>
            </div>
            <div className="text-muted small mt-1">₹{dTotal}</div>
          </div>
        </div>
      </div>

      {/* Live Cost Preview */}
      <div className="card border-0 bg-white shadow-sm mt-3 p-3">
        <div className="small fw-bold text-uppercase text-secondary mb-2">
          Estimated Final Bill Preview
        </div>
        <div className="d-flex justify-content-between small py-1 border-bottom">
          <span>Accommodation ({nights} night{nights > 1 ? "s" : ""} × ₹{nightlyRate}):</span>
          <strong>₹{roomCost.toFixed(2)}</strong>
        </div>
        <div className="d-flex justify-content-between small py-1 border-bottom">
          <span>Meal & Messing Subtotal:</span>
          <strong>₹{mealCost.toFixed(2)}</strong>
        </div>
        <div className="d-flex justify-content-between fs-6 fw-bold pt-2 text-dark">
          <span>Total Combined Bill:</span>
          <span className="text-success">₹{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      {err && <Alert className="mt-3">{err}</Alert>}
      {ok && <Alert type="success" className="mt-3">{ok}</Alert>}

      <button
        className="btn btn-dark w-100 mt-3"
        disabled={!can || busy}
        onClick={checkout}
      >
        <i className="bi bi-receipt me-2" />
        {busy ? "Generating final bill..." : `Approve Checkout & Bill (₹${grandTotal.toFixed(2)})`}
      </button>
    </Card>
  );
}


/* =========================================================
   READ-ONLY BOOKING CONTROL
   Used by PMC and Secretary Operations.
========================================================= */

function BookingControl({ role }) {
  const endpoint = role === "PMC" ? "/pmc/bookings" : "/secretary/bookings";

  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [sort, setSort] = useState("PENDING_ACTIONS");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const handleExportBookings = () => {
    const exportRows = filteredItems.map((booking) => ({
      "Officer Name": booking.booker?.name || "",

      Rank: booking.booker?.rank || "",

      "Service No": booking.booker?.serviceId || "",

      "Check In": dateOnly(booking.checkInDate),

      "Check Out": dateOnly(booking.checkOutDate),

      Nights: calculateNights(booking.checkInDate, booking.checkOutDate),

      Purpose: booking.purpose || "",

      Category: categoryName(booking.stayCategory),

      "Number of Guests":
        booking.numberOfGuests || booking.stayMembers?.length || 0,

      "Room Number": booking.roomNumber || "Not allotted",

      Status:
        booking.status === "CHECKED_OUT"
          ? booking.paymentStatus === "PAID"
            ? "PAYMENT COMPLETE"
            : "PAYMENT PENDING"
          : booking.status === "NO_SHOW"
            ? "NO SHOW"
            : String(booking.status || "").replaceAll("_", " "),

      "Payment Status": booking.paymentStatus || "",

      "Bill Amount": Number(booking.billAmount || 0),

      "Checkout Request": booking.checkoutRequestedAt
        ? dateOnly(booking.checkoutRequestedAt)
        : "",

      "Booking ID": String(booking._id || ""),
    }));

    if (!exportToExcel(exportRows, `Booking_Control_${localDate()}`)) {
      setErr("No booking data available to export.");
    }
  };

  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setErr("");
      const response = await api.get(endpoint);
      setItems(response.data?.bookings || []);
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // Load booking control data once when the page mounts.
  // Do not poll automatically; refresh only on a full page reload
  // or after an explicit user action that calls refresh().
  useEffect(() => {
    load();
  }, [endpoint]);

  const getCreatedTime = (booking) => {
    const value =
      booking.createdAt ||
      booking.requestedAt ||
      booking.created_at ||
      booking.updatedAt;

    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  const filteredItems = items
    .filter((booking) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const bookerName = String(booking.booker?.name || "").toLowerCase();
        const serviceId = String(booking.booker?.serviceId || "").toLowerCase();
        const roomNum = String(booking.roomNumber || booking.room?.roomNumber || "").toLowerCase();
        const cat = categoryName(booking.stayCategory).toLowerCase();
        const st = String(booking.status || "").toLowerCase();
        const dates = `${fmtDate(booking.checkInDate)} ${fmtDate(booking.checkOutDate)}`.toLowerCase();
        const matchesSearch =
          bookerName.includes(q) ||
          serviceId.includes(q) ||
          roomNum.includes(q) ||
          cat.includes(q) ||
          st.includes(q) ||
          dates.includes(q);
        if (!matchesSearch) return false;
      }

      switch (filter) {
        case "PAYMENT_COMPLETE":
          return (
            booking.status === "CHECKED_OUT" && booking.paymentStatus === "PAID"
          );
        case "PAYMENT_PENDING":
          return (
            booking.status === "CHECKED_OUT" && booking.paymentStatus !== "PAID"
          );
        case "PENDING_MANAGER":
        case "APPROVED":
        case "CHECKED_IN":
        case "CHECKOUT_REQUESTED":
        case "CHECKED_OUT":
        case "NO_SHOW":
        case "USER_CANCELLED":
          return booking.status === filter;
        case "ALL":
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const aIn = dateOnly(a.checkInDate);
      const bIn = dateOnly(b.checkInDate);
      const aOut = dateOnly(a.checkOutDate);
      const bOut = dateOnly(b.checkOutDate);

      const getPendingPriority = (booking) => {
        if (booking.status === "CHECKOUT_REQUESTED") return 1;
        if (booking.status === "APPROVED") return 2;
        if (booking.status === "CHECKED_IN") return 3;
        if (booking.status === "CHECKED_OUT" && booking.paymentStatus !== "PAID") return 4;
        if (booking.status === "PENDING_MANAGER") return 5;
        return 99;
      };

      switch (sort) {
        case "PENDING_ACTIONS": {
          const pA = getPendingPriority(a);
          const pB = getPendingPriority(b);
          if (pA !== pB) return pA - pB;
          return getCreatedTime(b) - getCreatedTime(a);
        }
        case "NEWEST":
          return getCreatedTime(b) - getCreatedTime(a);
        case "OLDEST":
          return getCreatedTime(a) - getCreatedTime(b);
        case "CHECKIN_ASC":
          return aIn.localeCompare(bIn);
        case "CHECKIN_DESC":
          return bIn.localeCompare(aIn);
        case "CHECKOUT_ASC":
          return aOut.localeCompare(bOut);
        case "CHECKOUT_DESC":
          return bOut.localeCompare(aOut);
        case "NAME_ASC":
          return String(a.booker?.name || "").localeCompare(
            String(b.booker?.name || ""),
          );
        case "AMOUNT_HIGH":
          return Number(b.billAmount || 0) - Number(a.billAmount || 0);
        case "AMOUNT_LOW":
          return Number(a.billAmount || 0) - Number(b.billAmount || 0);
        case "STATUS":
          return String(a.status || "").localeCompare(String(b.status || ""));
        default:
          return 0;
      }
    });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);

  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  );

  const reset = () => {
    setSearch("");
    setFilter("ALL");
    setSort("PENDING_ACTIONS");
    setPage(1);
  };

  return (
    <Card className="mt-3">
      <div className="d-flex justify-content-between align-items-center">
        <div>
          <h5 className="mb-0">
            <b>Booking Control</b>
          </h5>

          <small className="text-secondary">
            Booking operations are handled only by the Mess Manager.
          </small>
        </div>
      </div>

      {err && <Alert>{err}</Alert>}

      <div className="row g-2 mb-3 mt-2">
        <div className="col-md-4">
          <label className="form-label small fw-semibold">Search</label>
          <div className="input-group">
            <span className="input-group-text bg-white text-secondary">
              <i className="bi bi-search" />
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Officer, service ID, room..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {search && (
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
              >
                <i className="bi bi-x" />
              </button>
            )}
          </div>
        </div>

        <div className="col-md-3">
          <label className="form-label small fw-semibold">Filter</label>
          <select
            className="form-select"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="ALL">All bookings</option>
            <option value="PAYMENT_COMPLETE">Payment Complete</option>
            <option value="PAYMENT_PENDING">Payment Pending</option>
            <option value="PENDING_MANAGER">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="CHECKED_IN">Checked In</option>
            <option value="CHECKOUT_REQUESTED">Checkout Requested</option>
            <option value="CHECKED_OUT">Checked Out</option>
            <option value="NO_SHOW">No Show</option>
            <option value="USER_CANCELLED">User Cancelled</option>
          </select>
        </div>

        <div className="col-md-3">
          <label className="form-label small fw-semibold">Sort by</label>
          <select
            className="form-select"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="PENDING_ACTIONS">Pending Actions First</option>
            <option value="NEWEST">Newest booking</option>
            <option value="OLDEST">Oldest booking</option>
            <option value="CHECKIN_ASC">Check-in date ↑</option>
            <option value="CHECKIN_DESC">Check-in date ↓</option>
            <option value="CHECKOUT_ASC">Check-out date ↑</option>
            <option value="CHECKOUT_DESC">Check-out date ↓</option>
            <option value="NAME_ASC">Officer name A → Z</option>
            <option value="AMOUNT_HIGH">Amount high → low</option>
            <option value="AMOUNT_LOW">Amount low → high</option>
            <option value="STATUS">Status</option>
          </select>
        </div>

        <div className="col-md-2 d-flex align-items-end">
          <div className="d-flex gap-2 w-100">
            <button
              type="button"
              className="btn btn-outline-secondary flex-grow-1"
              onClick={reset}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn-outline-dark"
              onClick={load}
              disabled={loading}
              title="Refresh bookings"
            >
              <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {loading && !pageItems.length ? (
        <TableLoading loading={true} />
      ) : pageItems.length ? (
        <TableLoading loading={loading}>
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th>Stay</th>
                <th>Room</th>
                <th>Booking</th>
                <th>Purpose</th>
                <th>Checkout On</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {pageItems.map((booking) => (
                <tr key={String(booking._id)}>
                  <td>
                    <div className="small text-secondary">
                      Service No: {booking.booker?.serviceId || "—"}
                    </div>
                    <strong>
                      {booking.booker?.rank ? `${booking.booker.rank} ` : ""}
                      {booking.booker?.name || "Guest"}
                    </strong>
                  </td>

                  <td>
                    {booking.roomNumber ? (
                      <span>Room {booking.roomNumber}</span>
                    ) : (
                      <span className="text-secondary">Not allotted</span>
                    )}
                  </td>

                  <td className="text-nowrap">
                    {fmtDate(booking.checkInDate)}
                    {" → "}
                    {fmtDate(booking.checkOutDate)}
                  </td>

                  <td>{categoryName(booking.stayCategory)}</td>

                  <td className="text-nowrap">
                    {booking.checkoutRequestedAt ? (
                      <>
                        {fmtDate(booking.checkoutRequestedAt)}

                        <div className="small text">
                          Early checkout requested
                        </div>
                      </>
                    ) : (
                      <span className="text-secondary">—</span>
                    )}
                  </td>

                  <td>
                    <Badge
                      type={
                        booking.status === "CHECKED_IN"
                          ? "checked-in"
                          : booking.status === "APPROVED"
                            ? "approved"
                            : booking.status === "CHECKED_OUT"
                              ? booking.paymentStatus === "PAID"
                                ? "payment-complete"
                                : "payment-pending"
                              : booking.status === "NO_SHOW"
                                ? "danger"
                                : ["CANCELLED", "USER_CANCELLED"].includes(booking.status)
                                  ? "cancelled"
                                  : booking.status === "REJECTED"
                                    ? "rejected"
                                    : booking.status === "PENDING_MANAGER"
                                      ? "warning"
                                      : booking.status === "CHECKOUT_REQUESTED"
                                        ? "checkout-requested"
                                        : "secondary"
                      }
                    >
                      {booking.status === "CHECKED_OUT"
                        ? booking.paymentStatus === "PAID"
                          ? "PAYMENT COMPLETE"
                          : "PAYMENT PENDING"
                        : booking.status === "NO_SHOW"
                          ? "NO SHOW"
                          : String(booking.status || "").replaceAll("_", " ")}
                    </Badge>
                    {booking.status === "USER_CANCELLED" && booking.cancellationReason && (
                      <div className="small text-secondary mt-1 text-truncate" style={{ maxWidth: 180 }} title={booking.cancellationReason}>
                        Reason: {booking.cancellationReason}
                      </div>
                    )}
                    {booking.status === "REJECTED" && booking.rejectionReason && (
                      <div className="small text-secondary mt-1 text-truncate" style={{ maxWidth: 180 }} title={booking.rejectionReason}>
                        Reason: {booking.rejectionReason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableLoading>
      ) : (
        <Empty text="No bookings match the selected filter." />
      )}

      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <small className="text-secondary">
            Showing {startIndex + 1} –{" "}
            {Math.min(startIndex + PAGE_SIZE, filteredItems.length)} of{" "}
            {filteredItems.length}
          </small>

          <nav aria-label={`${role} booking pagination`}>
            <ul className="pagination pagination-sm mb-0">
              <li className={`page-item ${safePage === 1 ? "disabled" : ""}`}>
                <button
                  type="button"
                  className="page-link"
                  disabled={safePage === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
              </li>

              {pageNumbers.map((number) => (
                <li
                  key={number}
                  className={`page-item ${safePage === number ? "active" : ""}`}
                >
                  <button
                    type="button"
                    className="page-link"
                    onClick={() => setPage(number)}
                  >
                    {number}
                  </button>
                </li>
              ))}

              <li
                className={`page-item ${
                  safePage === totalPages ? "disabled" : ""
                }`}
              >
                <button
                  type="button"
                  className="page-link"
                  disabled={safePage === totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Next
                </button>
              </li>
            </ul>
          </nav>
        </div>
      )}
      <div className="d-flex justify-content-end mt-3 pt-3 border-top"></div>
    </Card>
  );
}

/* =========================================================
   MANAGER OPERATIONS
========================================================= */

export function Manager() {
  const [items, setItems] = useState([]);

  const [rooms, setRooms] = useState([]);

  const [err, setErr] = useState("");

  const [selected, setSelected] = useState(null);

  const [rejectTarget, setRejectTarget] = useState(null);

  const [checkoutBooking, setCheckoutBooking] = useState(null);

  const [editing, setEditing] = useState(null);

  const blank = {
    roomNumber: "",
    roomType: "STANDARD",
    capacity: 1,
    rates: {
      ...RATE,
      CHILD: 0,
    },
  };

  const [room, setRoom] = useState(blank);

  /* -----------------------------------------------------
       MANAGER CONTROL TABLE
       20 entries per page + filter + sorting + search
    ----------------------------------------------------- */

  const [managerSearch, setManagerSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("ALL");
  const [managerSort, setManagerSort] = useState("PENDING_ACTIONS");
  const [managerPage, setManagerPage] = useState(1);
  const MANAGER_PAGE_SIZE = 20;

  const [managerLoading, setManagerLoading] = useState(false);

  const load = () => {
    setManagerLoading(true);
    return Promise.all([api.get("/manager/bookings"), api.get("/rooms")])
      .then(([bookingsResponse, roomsResponse]) => {
        setItems(bookingsResponse.data?.bookings || []);

        setRooms(roomsResponse.data?.rooms || []);
      })
      .catch((error) => {
        setErr(errorMessage(error));
      })
      .finally(() => {
        setManagerLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const getPaymentState = (booking) => {
    if (booking.status !== "CHECKED_OUT") {
      return "";
    }

    return booking.paymentStatus === "PAID" ? "COMPLETE" : "PENDING";
  };

  const managerFilteredItems = items
    .filter((booking) => {
      const q = managerSearch.trim().toLowerCase();
      if (q) {
        const bookerName = String(booking.booker?.name || "").toLowerCase();
        const serviceId = String(booking.booker?.serviceId || "").toLowerCase();
        const roomNum = String(booking.roomNumber || booking.room?.roomNumber || "").toLowerCase();
        const cat = categoryName(booking.stayCategory).toLowerCase();
        const st = String(booking.status || "").toLowerCase();
        const dates = `${fmtDate(booking.checkInDate)} ${fmtDate(booking.checkOutDate)}`.toLowerCase();
        const matchesSearch =
          bookerName.includes(q) ||
          serviceId.includes(q) ||
          roomNum.includes(q) ||
          cat.includes(q) ||
          st.includes(q) ||
          dates.includes(q);
        if (!matchesSearch) return false;
      }

      switch (managerFilter) {
        case "PAYMENT_COMPLETE":
          return (
            booking.status === "CHECKED_OUT" && booking.paymentStatus === "PAID"
          );

        case "PAYMENT_PENDING":
          return (
            booking.status === "CHECKED_OUT" && booking.paymentStatus !== "PAID"
          );

        case "PENDING_MANAGER":
        case "APPROVED":
        case "CHECKED_IN":
        case "CHECKOUT_REQUESTED":
        case "CHECKED_OUT":
        case "NO_SHOW":
        case "USER_CANCELLED":
          return booking.status === managerFilter;

        case "ALL":
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const aIn = dateOnly(a.checkInDate);
      const bIn = dateOnly(b.checkInDate);
      const aOut = dateOnly(a.checkOutDate);
      const bOut = dateOnly(b.checkOutDate);

      // Actual booking/request timestamp
      const getCreatedTime = (booking) => {
        const value =
          booking.createdAt ||
          booking.requestedAt ||
          booking.created_at ||
          booking.updatedAt;

        if (!value) return 0;

        const time = new Date(value).getTime();

        return Number.isNaN(time) ? 0 : time;
      };

      const getPendingPriority = (booking) => {
        if (booking.status === "CHECKOUT_REQUESTED") return 1;
        if (booking.status === "APPROVED") return 2;
        if (booking.status === "CHECKED_IN") return 3;
        if (booking.status === "PENDING_MANAGER") return 4;
        return 99;
      };

      switch (managerSort) {
        case "PENDING_ACTIONS": {
          const pA = getPendingPriority(a);
          const pB = getPendingPriority(b);
          if (pA !== pB) return pA - pB;
          return getCreatedTime(b) - getCreatedTime(a);
        }

        case "NEWEST":
          // Latest booking/request first
          return getCreatedTime(b) - getCreatedTime(a);

        case "OLDEST":
          // Oldest booking/request first
          return getCreatedTime(a) - getCreatedTime(b);

        case "CHECKIN_ASC":
          return aIn.localeCompare(bIn);

        case "CHECKIN_DESC":
          return bIn.localeCompare(aIn);

        case "CHECKOUT_ASC":
          return aOut.localeCompare(bOut);

        case "CHECKOUT_DESC":
          return bOut.localeCompare(aOut);

        case "NAME_ASC":
          return String(a.booker?.name || "").localeCompare(
            String(b.booker?.name || ""),
          );

        case "AMOUNT_HIGH":
          return Number(b.billAmount || 0) - Number(a.billAmount || 0);

        case "AMOUNT_LOW":
          return Number(a.billAmount || 0) - Number(b.billAmount || 0);

        case "STATUS":
          return String(a.status || "").localeCompare(String(b.status || ""));

        default:
          return 0;
      }
    });

  const managerTotalPages = Math.max(
    1,
    Math.ceil(managerFilteredItems.length / MANAGER_PAGE_SIZE),
  );

  const safeManagerPage = Math.min(managerPage, managerTotalPages);

  const managerStartIndex = (safeManagerPage - 1) * MANAGER_PAGE_SIZE;

  const managerPageItems = managerFilteredItems.slice(
    managerStartIndex,
    managerStartIndex + MANAGER_PAGE_SIZE,
  );

  const managerPageNumbers = Array.from(
    { length: managerTotalPages },
    (_, index) => index + 1,
  );

  const handleExportManagerBookings = () => {
    const exportRows = managerFilteredItems.map((booking) => ({
      "Officer Name": booking.booker?.name || "",
      Rank: booking.booker?.rank || "",
      "Service No": booking.booker?.serviceId || "",
      "Check In": dateOnly(booking.checkInDate),
      "Check Out": dateOnly(booking.checkOutDate),
      Nights: calculateNights(booking.checkInDate, booking.checkOutDate),
      Purpose: booking.purpose || "",
      Category: categoryName(booking.stayCategory),
      "Number of Guests":
        booking.numberOfGuests || booking.stayMembers?.length || 0,
      "Room Number": booking.roomNumber || "Not allotted",
      Status:
        booking.status === "CHECKED_OUT"
          ? booking.paymentStatus === "PAID"
            ? "PAYMENT COMPLETE"
            : "PAYMENT PENDING"
          : booking.status === "NO_SHOW"
            ? "NO SHOW"
            : String(booking.status || "").replaceAll("_", " "),
      "Payment Status": booking.paymentStatus || "",
      "Bill Amount": Number(booking.billAmount || 0),
      "Checkout Request": booking.checkoutRequestedAt
        ? dateOnly(booking.checkoutRequestedAt)
        : "",
      "Booking ID": String(booking._id || ""),
    }));

    if (!exportToExcel(exportRows, `Manager_Booking_Control_${localDate()}`)) {
      setErr("No booking data available to export.");
    }
  };

  useEffect(() => {
    setManagerPage(1);
  }, [managerFilter, managerSort]);

  /* -----------------------------------------------------
       APPROVE BOOKING
    ----------------------------------------------------- */

  const approve = async (id) => {
    setErr("");

    try {
      /*
       * Backend approval does BOTH:
       *
       * 1. Approves booking
       * 2. Automatically allocates the best room
       */

      await api.patch(`/manager/bookings/${id}/approve`);

      /*
       * Reload booking list.
       */
      await load();

      /*
       * IMPORTANT:
       *
       * Force Monthly Occupancy to
       * fetch the updated database state.
       *
       * This makes the approved booking
       * appear GREEN immediately.
       */

      setOccupancyRefreshKey((value) => value + 1);
    } catch (error) {
      setErr(errorMessage(error));
    }
  };

  /* -----------------------------------------------------
       ROOM SAVE
    ----------------------------------------------------- */

  const save = async () => {
    setErr("");

    try {
      const payload = {
        ...room,

        capacity: Number(room.capacity),

        rates: Object.fromEntries(
          Object.entries(room.rates).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
      };

      if (editing) {
        await api.patch(`/rooms/${editing}`, payload);
      } else {
        await api.post("/rooms", payload);
      }

      setRoom({
        ...blank,
        rates: {
          ...RATE,
          CHILD: 0,
        },
      });

      setEditing(null);

      await load();
    } catch (error) {
      setErr(errorMessage(error));
    }
  };

  const [occupancyRefresh, setOccupancyRefresh] = useState(0);

  /* -----------------------------------------------------
       SELECT BOOKING
    ----------------------------------------------------- */

  const select = (id) => {
    /*
     * Occupancy sends booking ID.
     */

    const booking = items.find((item) => String(item._id) === String(id));

    if (!booking) {
      return;
    }

    if (["CHECKED_IN", "CHECKOUT_REQUESTED"].includes(booking.status)) {
      setCheckoutBooking(booking);
      setSelected(null);
      setTimeout(() => {
        const el = document.getElementById("checkout-panel");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    } else {
      setSelected(booking);
      setCheckoutBooking(null);
      setTimeout(() => {
        const el = document.getElementById("checkin-panel");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  };

  /* -----------------------------------------------------
       REFRESH SELECTED BOOKING
    ----------------------------------------------------- */

  const refresh = async () => {
    await load();
    setOccupancyRefresh((prev) => prev + 1);

    if (selected) {
      try {
        const response = await api.get(`/bookings/${selected._id}`);

        const updated = response.data?.booking || response.data;

        setSelected(updated);
      } catch {
        setSelected(null);
      }
    }

    if (checkoutBooking) {
      try {
        const response = await api.get(`/bookings/${checkoutBooking._id}`);

        const updated = response.data?.booking || response.data;

        if (["CHECKED_IN", "CHECKOUT_REQUESTED"].includes(updated.status)) {
          setCheckoutBooking(updated);
        } else {
          setCheckoutBooking(null);
        }
      } catch {
        setCheckoutBooking(null);
      }
    }
  };
  const [arrivalLoading, setArrivalLoading] = useState(false);
  const scrollToArrivalControl = () => {
    setArrivalLoading(true);

    setTimeout(() => {
      setArrivalLoading(false);

      const arrivalControl = document.getElementById("arrival-control");

      if (arrivalControl) {
        arrivalControl.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 2000);
  };

  const waitingCheckoutBookings = items.filter(
    (booking) => booking.status === "CHECKOUT_REQUESTED",
  );

  const handleSelectWaitingCheckout = (booking) => {
    setSelected(null);
    setCheckoutBooking(booking);
    const checkoutElement = document.getElementById("checkout-panel");
    if (checkoutElement) {
      checkoutElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <Page
      title="Manager operations"
      subtitle="Approve bookings and automatically allot the best available room during approval."
      actions={
        <Link className="btn btn-success" to="/manager/revenue">
          <i className="bi bi-graph-up-arrow me-2" />
          View revenue
        </Link>
      }
    >
      {err && <Alert>{err}</Alert>}

      {/* WAITING FOR CHECKOUT COUNTER IN MANAGER OPERATIONS */}
      {waitingCheckoutBookings.length > 0 && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center mb-3 shadow-sm">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-box-arrow-right fs-4 text-danger"></i>
            <div>
              <strong>
                {waitingCheckoutBookings.length} guest
                {waitingCheckoutBookings.length === 1 ? "" : "s"} waiting for checkout
              </strong>
              <small className="text-secondary d-block">
                Guests have requested checkout and room vacating. Verify their stay
                in Departure Control below to generate final bills and clear rooms.
              </small>
            </div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-danger text-white px-2 py-1 fs-6">
              {waitingCheckoutBookings.length} checkout
              {waitingCheckoutBookings.length === 1 ? "" : "s"} pending
            </span>
            <button
              type="button"
              className="btn btn-sm btn-dark"
              onClick={() => handleSelectWaitingCheckout(waitingCheckoutBookings[0])}
            >
              Review & Checkout ({waitingCheckoutBookings[0].booker?.name || "Guest"})
            </button>
          </div>
        </div>
      )}

      {/* =================================================
                MONTHLY OCCUPANCY
            ================================================= */}

      <Occupancy onSelectBooking={select} refreshTrigger={occupancyRefresh} />

      {/* =================================================
                CHECK-IN
            ================================================= */}

      <CheckInPanel booking={selected} onDone={refresh} />

      {/* =================================================
                CHECKOUT
            ================================================= */}

      <CheckoutPanel booking={checkoutBooking} onDone={refresh} />
      <div className="row g-3 mt-1">
        <Card>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <div className="section-kicker">
                <h5>Manager Control</h5>
              </div>

              <h5 className="mb-0">Bookings & departures</h5>

              <small className="text-secondary">
                Room is automatically allocated when the booking is approved.
              </small>
            </div>

            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-success"
                onClick={handleExportManagerBookings}
                disabled={managerFilteredItems.length === 0}
              >
                <i className="bi bi-file-earmark-excel me-2"></i>
                Export Data to Excel
              </button>
            </div>
          </div>

          <div className="row g-2 mb-3">
            <div className="col-md-4">
              <label className="form-label small fw-semibold">Search</label>
              <div className="input-group">
                <span className="input-group-text bg-white text-secondary">
                  <i className="bi bi-search" />
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Officer, service ID, room..."
                  value={managerSearch}
                  onChange={(e) => {
                    setManagerSearch(e.target.value);
                    setManagerPage(1);
                  }}
                />
                {managerSearch && (
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => {
                      setManagerSearch("");
                      setManagerPage(1);
                    }}
                  >
                    <i className="bi bi-x" />
                  </button>
                )}
              </div>
            </div>

            <div className="col-md-3">
              <label className="form-label small fw-semibold">Filter</label>

              <select
                className="form-select"
                value={managerFilter}
                onChange={(e) => {
                  setManagerFilter(e.target.value);
                  setManagerPage(1);
                }}
              >
                <option value="ALL">All bookings</option>
                <option value="PAYMENT_COMPLETE">Payment Complete</option>
                <option value="PAYMENT_PENDING">Payment Pending</option>
                <option value="PENDING_MANAGER">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="CHECKED_IN">Checked In</option>
                <option value="CHECKOUT_REQUESTED">Checkout Requested</option>
                <option value="CHECKED_OUT">Checked Out</option>
                <option value="NO_SHOW">No Show</option>
                <option value="USER_CANCELLED">User Cancelled</option>
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label small fw-semibold">Sort by</label>

              <select
                className="form-select"
                value={managerSort}
                onChange={(e) => {
                  setManagerSort(e.target.value);
                  setManagerPage(1);
                }}
              >
                <option value="PENDING_ACTIONS">Pending Actions First (Check-out, Approved, Checked-in)</option>
                <option value="NEWEST">Newest booking</option>
                <option value="OLDEST">Oldest booking</option>
                <option value="CHECKIN_ASC">Check-in date ↑</option>
                <option value="CHECKIN_DESC">Check-in date ↓</option>
                <option value="CHECKOUT_ASC">Check-out date ↑</option>
                <option value="CHECKOUT_DESC">Check-out date ↓</option>
                <option value="NAME_ASC">Officer name A → Z</option>
                <option value="AMOUNT_HIGH">Amount high → low</option>
                <option value="AMOUNT_LOW">Amount low → high</option>
                <option value="STATUS">Status</option>
              </select>
            </div>

            <div className="col-md-2 d-flex align-items-end">
              <div className="d-flex gap-2 w-100">
                <button
                  type="button"
                  className="btn btn-outline-secondary flex-grow-1"
                  onClick={() => {
                    setManagerSearch("");
                    setManagerFilter("ALL");
                    setManagerSort("PENDING_ACTIONS");
                    setManagerPage(1);
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn btn-outline-dark"
                  onClick={load}
                  disabled={managerLoading}
                  title="Refresh bookings"
                >
                  <i className={`bi bi-arrow-clockwise ${managerLoading ? "spin" : ""}`} />
                </button>
              </div>
            </div>
          </div>

          {managerLoading && !managerPageItems.length ? (
            <TableLoading loading={true} />
          ) : managerPageItems.length ? (
            <TableLoading loading={managerLoading}>
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Stay</th>
                    <th>Booking</th>
                    <th>Purpose</th>
                    <th>Room</th>
                    <th>Checkout Request</th>
                    <th>Status</th>
                    <th className="text-end">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {managerPageItems.map((booking) => {
                    const nights = calculateNights(
                      booking.checkInDate,
                      booking.checkOutDate,
                    );

                    const paymentState = getPaymentState(booking);

                    return (
                      <tr key={String(booking._id)}>
                        <td>
                          <div className="small text-secondary">
                            Service No: {booking.booker?.serviceId || "—"}
                          </div>
                          <strong>
                            {booking.booker?.rank
                              ? `${booking.booker.rank} `
                              : ""}
                            {booking.booker?.name || "Guest"}
                          </strong>
                        </td>

                        <td className="text-nowrap">
                          {fmtDate(booking.checkInDate)}
                          {" → "}
                          {fmtDate(booking.checkOutDate)}
                        </td>

                        <td>{categoryName(booking.stayCategory)}</td>

                        <td>
                          {booking.roomNumber ? (
                            <span>Room {booking.roomNumber}</span>
                          ) : (
                            <span className="text-secondary">Not allotted</span>
                          )}
                        </td>

                        <td className="text-nowrap">
                          {booking.checkoutRequestedAt ? (
                            <>
                              {fmtDate(booking.checkoutRequestedAt)}

                              <div className="small text-secondary">
                                requested for early checkout
                              </div>
                            </>
                          ) : (
                            <span className="text-secondary">—</span>
                          )}
                        </td>

                        <td>
                          <Badge
                            type={
                              booking.status === "CHECKED_IN"
                                ? "checked-in"
                                : booking.status === "APPROVED"
                                  ? "approved"
                                  : booking.status === "CHECKED_OUT"
                                    ? booking.paymentStatus === "PAID"
                                      ? "payment-complete"
                                      : "payment-pending"
                                    : booking.status === "NO_SHOW"
                                      ? "danger"
                                      : ["CANCELLED", "USER_CANCELLED"].includes(booking.status)
                                        ? "cancelled"
                                        : booking.status === "REJECTED"
                                          ? "rejected"
                                          : booking.status === "PENDING_MANAGER"
                                            ? "warning"
                                            : booking.status === "CHECKOUT_REQUESTED"
                                              ? "checkout-requested"
                                              : "secondary"
                            }
                          >
                            {booking.status === "CHECKED_OUT"
                              ? booking.paymentStatus === "PAID"
                                ? "PAYMENT COMPLETE"
                                : "PAYMENT PENDING"
                              : booking.status === "NO_SHOW"
                                ? "NO SHOW"
                                : String(booking.status || "").replaceAll(
                                    "_",
                                    " ",
                                  )}
                          </Badge>
                          {booking.status === "USER_CANCELLED" && booking.cancellationReason && (
                            <div className="small text-secondary mt-1 text-truncate" style={{ maxWidth: 180 }} title={booking.cancellationReason}>
                              Reason: {booking.cancellationReason}
                            </div>
                          )}
                          {booking.status === "REJECTED" && booking.rejectionReason && (
                            <div className="small text-secondary mt-1 text-truncate" style={{ maxWidth: 180 }} title={booking.rejectionReason}>
                              Reason: {booking.rejectionReason}
                            </div>
                          )}
                        </td>

                        <td className="text-end">
                          {booking.status === "PENDING_MANAGER" && (
                            <div className="d-flex gap-1 justify-content-end">
                              <button
                                className="btn btn-sm btn-warning text-dark"
                                onClick={() => approve(booking._id)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-sm btn-light border text-dark"
                                onClick={() => setRejectTarget(booking)}
                              >
                                Reject
                              </button>
                            </div>
                          )}

                          {booking.status === "APPROVED" && (
                            <button
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => {
                                setSelected(booking);
                                scrollToArrivalControl();
                              }}
                            >
                              Check in
                            </button>
                          )}

                          {booking.status === "CHECKED_IN" && (
                            <button
                              className="btn btn-sm btn-outline-warning text-dark"
                              onClick={() => {
                                setCheckoutBooking(booking);
                                scrollToArrivalControl();
                              }}
                            >
                              Checkout
                            </button>
                          )}

                          {booking.status === "CHECKOUT_REQUESTED" && (
                            <button
                              className="btn btn-sm btn-outline-warning text-dark"
                              onClick={() => setCheckoutBooking(booking)}
                            >
                              Review
                            </button>
                          )}

                          {booking.status === "CHECKED_OUT" && (
                            <span className="small text-secondary">
                              Completed
                            </span>
                          )}

                          {booking.status === "NO_SHOW" && (
                            <span className="small text-danger fw-semibold">
                              No action
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableLoading>
          ) : (
            <Empty text="No bookings match the selected filter." />
          )}

          {managerTotalPages > 1 && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <small className="text-secondary">
                Showing {managerStartIndex + 1}
                {" – "}
                {Math.min(
                  managerStartIndex + MANAGER_PAGE_SIZE,
                  managerFilteredItems.length,
                )}
                {" of "}
                {managerFilteredItems.length}
              </small>

              <nav aria-label="Manager Control pagination">
                <ul className="pagination pagination-sm mb-0">
                  <li
                    className={`page-item ${
                      safeManagerPage === 1 ? "disabled" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="page-link"
                      disabled={safeManagerPage === 1}
                      onClick={() =>
                        setManagerPage((page) => Math.max(1, page - 1))
                      }
                    >
                      Previous
                    </button>
                  </li>

                  {managerPageNumbers.map((page) => (
                    <li
                      key={page}
                      className={`page-item ${
                        safeManagerPage === page ? "active" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="page-link"
                        onClick={() => setManagerPage(page)}
                      >
                        {page}
                      </button>
                    </li>
                  ))}

                  <li
                    className={`page-item ${
                      safeManagerPage === managerTotalPages ? "disabled" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="page-link"
                      disabled={safeManagerPage === managerTotalPages}
                      onClick={() =>
                        setManagerPage((page) =>
                          Math.min(managerTotalPages, page + 1),
                        )
                      }
                    >
                      Next
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          )}
        </Card>
      </div>

      {rejectTarget && (
        <RejectBookingModal
          booking={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={() => {
            setRejectTarget(null);
            refresh();
          }}
        />
      )}
    </Page>
  );
}

/* =========================================================
   PMC STAFF FORM
========================================================= */

const emptyStaff = {
  name: "",
  serviceId: "",
  rank: "",
  email: "",
  mobile: "",
  password: "",
};

function StaffForm({ type, existing, value, setValue, onSave }) {
  const label = type === "manager" ? "Manager" : "Secretary";

  return (
    <Card className="mt-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div className="section-kicker">STAFF ADMINISTRATION</div>

          <h5>
            {existing ? "Update" : "Add"} Mess {label}
          </h5>

          <small className="text-secondary">
            PMC manages staff accounts. Booking approval remains with the Mess
            Manager.
          </small>
        </div>

        <Badge type="dark">PMC</Badge>
      </div>

      <form onSubmit={(event) => onSave(type, event)}>
        <div className="row">
          <div className="col-md-6">
            <Field
              label="Service No."
              value={value.serviceId}
              required
              onChange={(v) =>
                setValue({
                  ...value,
                  serviceId: v,
                })
              }
            />
          </div>

          <div className="col-md-6">
            <Field
              label="Rank"
              value={value.rank}
              onChange={(v) =>
                setValue({
                  ...value,
                  rank: v,
                })
              }
            />
          </div>
        </div>

        <div className="row">
          <div className="col-md-6">
            <Field
              label="Name"
              value={value.name}
              required
              onChange={(v) =>
                setValue({
                  ...value,
                  name: v,
                })
              }
            />
          </div>

          <div className="col-md-6">
            <Field
              label="Mobile"
              value={value.mobile}
              onChange={(v) =>
                setValue({
                  ...value,
                  mobile: v,
                })
              }
            />
          </div>
        </div>

        <Field
          label="Email / Login ID"
          type="email"
          value={value.email}
          required
          onChange={(v) =>
            setValue({
              ...value,
              email: v,
            })
          }
        />

        <Field
          label={existing ? "New Password (optional)" : "Password"}
          type="password"
          value={value.password}
          onChange={(v) =>
            setValue({
              ...value,
              password: v,
            })
          }
        />

        <button className="btn btn-dark">
          {existing ? "Update" : "Add"} {label}
        </button>
      </form>
    </Card>
  );
}

/* =========================================================
   PMC STAFF MANAGEMENT
   Separate pages for Manager / Secretary
========================================================= */

export function StaffManagement({ type }) {
  const [data, setData] = useState(null);

  const [err, setErr] = useState("");

  const [ok, setOk] = useState("");

  const [manager, setManager] = useState({
    name: "",
    serviceId: "",
    rank: "",
    email: "",
    mobile: "",
    password: "",
  });

  const [secretary, setSecretary] = useState({
    name: "",
    serviceId: "",
    rank: "",
    email: "",
    mobile: "",
    password: "",
  });

  const load = async () => {
    try {
      setErr("");

      const response = await api.get("/pmc/my-mess");

      setData(response.data);

      if (response.data?.manager) {
        setManager({
          name: response.data.manager.name || "",
          serviceId: response.data.manager.serviceId || "",
          rank: response.data.manager.rank || "",
          email: response.data.manager.email || "",
          mobile:
            response.data.manager.mobile || response.data.manager.phone || "",
          password: "",
        });
      }

      if (response.data?.secretary) {
        setSecretary({
          name: response.data.secretary.name || "",
          serviceId: response.data.secretary.serviceId || "",
          rank: response.data.secretary.rank || "",
          email: response.data.secretary.email || "",
          mobile:
            response.data.secretary.mobile ||
            response.data.secretary.phone ||
            "",
          password: "",
        });
      }
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const isManager = type === "manager";

  const staff = isManager ? manager : secretary;

  const setStaff = isManager ? setManager : setSecretary;

  const existing = isManager
    ? Boolean(data?.manager)
    : Boolean(data?.secretary);

  const title = isManager ? "Mess Manager Details" : "Mess Secretary Details";

  const description = isManager
    ? "PMC manages the Mess Manager account. The Mess Manager is responsible for booking approval and guest operations."
    : "PMC manages the Mess Secretary account. The Mess Secretary monitors bookings and mess operations.";

  const save = async (e) => {
    e.preventDefault();

    try {
      setErr("");
      setOk("");

      const payload = {
        name: staff.name,
        serviceId: staff.serviceId,
        rank: staff.rank,
        email: staff.email,
        mobile: staff.mobile,
      };
      if (staff.password?.trim()) {
        payload.password = staff.password;
      }

      const endpoint = isManager
        ? "/pmc/my-mess/manager"
        : "/pmc/my-mess/secretary";

      await api.patch(endpoint, payload);

      setOk(
        isManager
          ? "Mess Manager account updated successfully."
          : "Mess Secretary account updated successfully.",
      );

      setStaff((prev) => ({
        ...prev,
        password: "",
      }));

      await load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Page title={title} subtitle={description}>
      {ok && <div className="alert alert-success">{ok}</div>}

      {err && <div className="alert alert-danger">{err}</div>}

      <Card>
        <form onSubmit={save}>
          <div className="row g-3">
            {/* SERVICE NO */}
            <div className="col-md-6">
              <label className="form-label">Service No</label>

              <input
                type="text"
                className="form-control"
                value={staff.serviceId}
                onChange={(e) =>
                  setStaff({
                    ...staff,
                    serviceId: e.target.value,
                  })
                }
                placeholder="e.g. IC-12345"
                required
              />
            </div>

            {/* RANK */}
            <div className="col-md-6">
              <label className="form-label">Rank</label>

              <input
                type="text"
                className="form-control"
                value={staff.rank}
                onChange={(e) =>
                  setStaff({
                    ...staff,
                    rank: e.target.value,
                  })
                }
                placeholder="e.g. Major / Lt Col"
                required
              />
            </div>

            {/* FULL NAME */}
            <div className="col-md-6">
              <label className="form-label">Full Name</label>

              <input
                type="text"
                className="form-control"
                value={staff.name}
                onChange={(e) =>
                  setStaff({
                    ...staff,
                    name: e.target.value,
                  })
                }
                placeholder={
                  isManager
                    ? "Enter Mess Manager name"
                    : "Enter Mess Secretary name"
                }
                required
              />
            </div>

            {/* MOBILE */}
            <div className="col-md-6">
              <label className="form-label">Mobile No.</label>

              <input
                type="tel"
                className="form-control"
                value={staff.mobile}
                onChange={(e) =>
                  setStaff({
                    ...staff,
                    mobile: e.target.value,
                  })
                }
                placeholder="Enter mobile number"
                required
              />
            </div>

            {/* EMAIL */}
            <div className="col-md-6">
              <label className="form-label">Email</label>

              <input
                type="email"
                className="form-control"
                value={staff.email}
                onChange={(e) =>
                  setStaff({
                    ...staff,
                    email: e.target.value,
                  })
                }
                placeholder="Enter email"
                required
              />
            </div>

            {/* PASSWORD */}
            <div className="col-md-6">
              <label className="form-label">
                {existing ? "New Password (optional)" : "Password"}
              </label>

              <input
                type="password"
                className="form-control"
                value={staff.password}
                onChange={(e) =>
                  setStaff({
                    ...staff,
                    password: e.target.value,
                  })
                }
                placeholder={
                  existing
                    ? "Leave blank to keep current password"
                    : "Enter password"
                }
                required={!existing}
              />
            </div>
          </div>

          <div className="mt-4 d-flex justify-content-end">
            <button type="submit" className="btn btn-primary">
              <i className="bi bi-person-check me-2"></i>

              {existing
                ? `Update ${isManager ? "Mess Manager" : "Mess Secretary"}`
                : `Add ${isManager ? "Mess Manager" : "Mess Secretary"}`}
            </button>
          </div>
        </form>
      </Card>
    </Page>
  );
}

/* =========================================================
   PMC / SECRETARY OPERATIONS
========================================================= */

export function Staff({ role }) {
  if (role === "SECRETARY") {
    return (
      <Page
        title="Secretary Operations"
        subtitle="Monitor monthly room occupancy and all mess bookings. Booking operations are read-only."
      >
        <Occupancy />
        <BookingControl role="SECRETARY" />
      </Page>
    );
  }

  if (role === "PMC") {
    return (
      <Page
        title="PMC Operations"
        subtitle="Monitor monthly room occupancy and all mess bookings. Booking operations are read-only."
      >
        <Occupancy />
        <BookingControl role="PMC" />
      </Page>
    );
  }

  return (
    <Page title="Staff" subtitle="Staff operations">
      <div className="alert alert-info">
        Staff operations are not available for this role.
      </div>
    </Page>
  );
}
