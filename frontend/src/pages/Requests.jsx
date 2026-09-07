import React, { useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";
import {
  categoryName,
  fmtDate,
  ROLES,
  dateOnly,
  calculateNights,
} from "../constants";
import { Page, Card, Alert, Badge, Empty, TableLoading } from "../components/UI";

/* =========================================================
   STAY DISPLAY
========================================================= */

const stayEnd = (booking) =>
  booking.status === "CHECKED_OUT"
    ? booking.displayCheckOutDate ||
      booking.actualCheckOutDate ||
      booking.checkOutDate
    : booking.checkOutDate;

const stayNights = (booking) =>
  booking.status === "CHECKED_OUT"
    ? Math.max(1, Number(booking.displayNights ?? booking.nights ?? 1))
    : calculateNights(booking.checkInDate, booking.checkOutDate);

/* =========================================================
   PAYMENT STATE
========================================================= */

const getPaymentState = (booking) => {
  if (booking.status !== "CHECKED_OUT") {
    return "";
  }

  return booking.paymentStatus === "PAID" ? "COMPLETE" : "PENDING";
};

/* =========================================================
   STATUS BADGE
========================================================= */

const getStatusBadge = (booking) => {
  if (booking.status === "CHECKED_IN") {
    return {
      type: "checked-in",
      label: "CHECKED IN",
    };
  }

  if (booking.status === "APPROVED") {
    return {
      type: "approved",
      label: "APPROVED",
    };
  }

  if (booking.status === "CHECKED_OUT") {
    return booking.paymentStatus === "PAID"
      ? {
          type: "payment-complete",
          label: "PAYMENT COMPLETE",
        }
      : {
          type: "payment-pending",
          label: "PAYMENT PENDING",
        };
  }

  if (booking.status === "NO_SHOW") {
    return {
      type: "danger",
      label: "NO SHOW",
    };
  }

  if (booking.status === "USER_CANCELLED" || booking.status === "CANCELLED") {
    return {
      type: "cancelled",
      label: booking.status === "USER_CANCELLED" ? "USER CANCELLED" : "CANCELLED",
    };
  }

  if (booking.status === "REJECTED") {
    return {
      type: "rejected",
      label: "REJECTED",
    };
  }

  if (booking.status === "PENDING_MANAGER") {
    return {
      type: "warning",
      label: "PENDING MANAGER",
    };
  }

  if (booking.status === "CHECKOUT_REQUESTED") {
    return {
      type: "checkout-requested",
      label: "CHECKOUT REQUESTED",
    };
  }

  return {
    type: "secondary",
    label: String(booking.status || "").replaceAll("_", " "),
  };
};

/* =========================================================
   REJECT BOOKING MODAL
========================================================= */

export function RejectBookingModal({ booking, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!booking) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErr("Please provide a reason for rejecting this booking.");
      return;
    }
    try {
      setBusy(true);
      setErr("");
      await api.patch(`/manager/bookings/${booking._id}/reject`, {
        reason: reason.trim(),
      });
      onSuccess?.();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 1055 }}
    >
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title text-danger">
              <i className="bi bi-x-circle me-2" />
              Reject Stay Request
            </h5>
            <button
              type="button"
              className="btn-close"
              disabled={busy}
              onClick={onClose}
            />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {err && <Alert>{err}</Alert>}
              <p className="mb-2">
                Are you sure you want to reject the stay request for{" "}
                <strong>{booking.booker?.name || "Guest"}</strong> (
                {fmtDate(booking.checkInDate)} → {fmtDate(booking.checkOutDate)})?
              </p>
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Reason for Rejection <span className="text-danger">*</span>
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Room capacity unavailable, maintenance in progress, official priority movement..."
                  required
                  disabled={busy}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={busy || !reason.trim()}
              >
                {busy ? "Rejecting…" : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   REQUESTS PAGE
========================================================= */

export default function Requests({ role }) {
  const isManager = role === ROLES.MANAGER || role === "MANAGER";

  const isPMC = role === ROLES.PMC || role === "PMC";

  const isSecretary = role === ROLES.SECRETARY || role === "SECRETARY";

  const endpoint = isManager
    ? "/manager/bookings"
    : isPMC
      ? "/pmc/bookings"
      : "/secretary/bookings";

  /* -----------------------------------------------------
       DATA
    ----------------------------------------------------- */

  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [loading, setLoading] = useState(false);

  /* -----------------------------------------------------
       FILTER / SORT / PAGINATION
    ----------------------------------------------------- */

  const [filter, setFilter] = useState(isManager ? "PENDING_MANAGER" : "ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("PENDING_ACTIONS");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  /* -----------------------------------------------------
       LOAD
    ----------------------------------------------------- */

  const load = async () => {
    try {
      setLoading(true);
      setErr("");

      const response = await api.get(endpoint, {
        params: isManager ? { status: "PENDING_MANAGER" } : {},
      });

      setItems(
        Array.isArray(response.data)
          ? response.data
          : response.data?.bookings || [],
      );
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [endpoint]);

  /* -----------------------------------------------------
       MANAGER ACTIONS
       ONLY MANAGER CAN USE THESE
    ----------------------------------------------------- */

  const approve = async (id) => {
    setBusy(String(id));
    setErr("");

    try {
      await api.patch(`/manager/bookings/${id}/approve`);

      await load();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  const reject = async (id) => {
    setBusy(String(id));
    setErr("");

    try {
      await api.patch(`/manager/bookings/${id}/reject`);

      await load();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy("");
    }
  };

  /* =====================================================
       FILTER & SEARCH
    ===================================================== */

  const filteredItems = items.filter((booking) => {
    // Search query filter
    const q = search.trim().toLowerCase();
    if (q) {
      const bookerName = String(booking.booker?.name || "").toLowerCase();
      const serviceId = String(booking.booker?.serviceId || "").toLowerCase();
      const roomNum = String(booking.room?.roomNumber || "").toLowerCase();
      const cat = categoryName(booking.stayCategory).toLowerCase();
      const st = String(booking.status || "").toLowerCase();
      const dates = `${fmtDate(booking.checkInDate)} ${fmtDate(booking.checkOutDate)}`.toLowerCase();
      const reason = `${booking.rejectionReason || ""} ${booking.cancellationReason || ""}`.toLowerCase();
      const matchesSearch =
        bookerName.includes(q) ||
        serviceId.includes(q) ||
        roomNum.includes(q) ||
        cat.includes(q) ||
        st.includes(q) ||
        dates.includes(q) ||
        reason.includes(q);
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

      case "NO_SHOW":
        return booking.status === "NO_SHOW";

      case "USER_CANCELLED":
        return booking.status === "USER_CANCELLED";

      case "PENDING_MANAGER":
      case "APPROVED":
      case "CHECKED_IN":
      case "CHECKOUT_REQUESTED":
      case "CHECKED_OUT":
        return booking.status === filter;

      case "ALL":
      default:
        return true;
    }
  });

  /* =====================================================
       SORT
    ===================================================== */

  const getCreatedTime = (booking) => {
    const value =
      booking.createdAt ||
      booking.requestedAt ||
      booking.created_at ||
      booking.updatedAt;

    if (!value) {
      return 0;
    }

    const time = new Date(value).getTime();

    return Number.isNaN(time) ? 0 : time;
  };

  const sortedItems = [...filteredItems].sort((a, b) => {
    const aIn = dateOnly(a.checkInDate);

    const bIn = dateOnly(b.checkInDate);

    const aOut = dateOnly(a.checkOutDate);

    const bOut = dateOnly(b.checkOutDate);

    const getPendingPriority = (booking) => {
      if (booking.status === "CHECKOUT_REQUESTED") return 1;
      if (booking.status === "APPROVED") return 2;
      if (booking.status === "CHECKED_IN") return 3;
      if (booking.status === "PENDING_MANAGER") return 4;
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

  /* =====================================================
       PAGINATION
    ===================================================== */

  const totalPages = Math.max(1, Math.ceil(sortedItems.length / PAGE_SIZE));

  const safePage = Math.min(page, totalPages);

  const startIndex = (safePage - 1) * PAGE_SIZE;

  const pageItems = sortedItems.slice(startIndex, startIndex + PAGE_SIZE);

  const pageNumbers = Array.from(
    {
      length: totalPages,
    },
    (_, index) => index + 1,
  );

  useEffect(() => {
    setPage(1);
  }, [filter, sort]);

  /* =====================================================
       PAGE TEXT
    ===================================================== */

  const title = isManager
    ? "Manager booking queue"
    : isPMC
      ? "PMC booking monitor"
      : "Secretary booking monitor";

  const subtitle = isManager
    ? "Review accommodation requests. The Mess Manager has sole authority to approve or reject bookings."
    : isPMC
      ? "Read-only booking monitoring. Approval, check-in and checkout are handled by the Mess Manager."
      : "Read-only booking monitoring. The Secretary cannot approve, reject, check in or check out any guest.";

  const cardTitle = isManager
    ? "Pending accommodation requests"
    : "Bookings & departures";

  return (
    <Page title={title} subtitle={subtitle}>
      {err && <Alert>{err}</Alert>}

      <Card>
        {/* =================================================
                    HEADER
                ================================================= */}

        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <div className="section-kicker">
              {isManager ? "MANAGER CONTROL" : "READ ONLY"}
            </div>

            <h5 className="mb-0">{cardTitle}</h5>

            <small className="text-secondary">
              {isManager
                ? "Review requests and approve or reject accommodation."
                : "Same booking information and controls as Manager view, without operational actions."}
            </small>
          </div>

          {isManager ? (
            <span className={`badge px-3 py-2 fs-6 ${items.length > 0 ? "bg-warning text-dark" : "bg-success text-white"}`}>
              <i className={`bi ${items.length > 0 ? "bi-hourglass-split" : "bi-check-circle"} me-1`}></i>
              {items.length > 0
                ? `${items.length} unacknowledged request${items.length === 1 ? "" : "s"}`
                : "All requests acknowledged"}
            </span>
          ) : (
            <Badge type="dark">{items.length} total</Badge>
          )}
        </div>

        {/* =================================================
                    FILTER + SORT + SEARCH
                ================================================= */}

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
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary flex-grow-1"
                onClick={() => {
                  setSearch("");
                  setFilter(isManager ? "PENDING_MANAGER" : "ALL");
                  setSort("PENDING_ACTIONS");
                  setPage(1);
                }}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn btn-outline-dark"
                onClick={load}
                disabled={loading}
                title="Refresh requests"
              >
                <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* =================================================
                    TABLE
                ================================================= */}

        {loading && !pageItems.length ? (
          <TableLoading loading={true} />
        ) : pageItems.length ? (
          <TableLoading loading={loading}>
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th>Officer</th>

                  <th>Stay</th>

                  <th>Nights</th>

                  <th>Category</th>

                  <th>Members</th>

                  <th>Room</th>

                  <th>Checkout Request</th>

                  <th>Status</th>

                  {isManager && <th className="text-end">Action</th>}
                </tr>
              </thead>

              <tbody>
                {pageItems.map((booking) => {
                  const status = getStatusBadge(booking);

                  const paymentState = getPaymentState(booking);

                  return (
                    <tr key={String(booking._id)}>
                      <td>
                        <div className="small text-secondary">
                          Service No: {booking.booker?.serviceId || "—"}
                        </div>
                        <strong>
                          {booking.booker?.rank ? `${booking.booker.rank} ` : ""}
                          {booking.booker?.name || "—"}
                        </strong>
                      </td>

                      {/* STAY */}
                      <td className="text-nowrap">
                        {fmtDate(booking.checkInDate)}

                        {" → "}

                        {fmtDate(stayEnd(booking))}

                        {booking.status === "CHECKED_OUT" && (
                          <div className="small text-secondary">Final stay</div>
                        )}
                      </td>

                      {/* NIGHTS */}
                      <td className="text-nowrap">
                        <strong>{stayNights(booking)}</strong> night(s)
                      </td>

                      {/* CATEGORY */}
                      <td>{categoryName(booking.stayCategory)}</td>

                      {/* MEMBERS */}
                      <td>
                        {booking.numberOfGuests ||
                          booking.stayMembers?.length ||
                          0}
                      </td>

                      {/* ROOM */}
                      <td>
                        {booking.roomNumber ? (
                          <span className="fw-semibold">
                            Room {booking.roomNumber}
                          </span>
                        ) : (
                          <span className="text-secondary">Not allotted</span>
                        )}
                      </td>

                      {/* CHECKOUT REQUEST */}
                      <td className="text-nowrap">
                        {booking.checkoutRequestedAt ? (
                          <>
                            <strong>
                              {fmtDate(booking.checkoutRequestedAt)}
                            </strong>

                            <div className="small text-warning">
                              Early checkout requested
                            </div>
                          </>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>

                      {/* STATUS */}
                      <td>
                        <Badge type={status.type}>{status.label}</Badge>

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

                        {paymentState && (
                          <div className="small text-secondary mt-1">
                            {paymentState === "COMPLETE"
                              ? "Payment settled"
                              : "Payment pending"}
                          </div>
                        )}
                      </td>

                      {/* MANAGER ACTIONS ONLY */}
                      {isManager && (
                        <td className="text-end text-nowrap">
                          {booking.status === "PENDING_MANAGER" && (
                            <>
                              <button
                                type="button"
                                disabled={!!busy}
                                className="btn btn-sm btn-warning text-dark me-2"
                                onClick={() => approve(booking._id)}
                              >
                                {busy === String(booking._id)
                                  ? "Working…"
                                  : "Approve"}
                              </button>

                              <button
                                type="button"
                                disabled={!!busy}
                                className="btn btn-sm btn-light border text-dark"
                                onClick={() => setRejectTarget(booking)}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {booking.status === "APPROVED" && (
                            <span className="small text-secondary">
                              Approved
                            </span>
                          )}

                          {booking.status === "CHECKED_IN" && (
                            <span className="small text-secondary">
                              Checked in
                            </span>
                          )}

                          {booking.status === "CHECKOUT_REQUESTED" && (
                            <span className="small text-warning fw-semibold">
                              Review checkout
                            </span>
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
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableLoading>
        ) : (
          <Empty
            text={
              isManager
                ? "No pending booking requests."
                : "No bookings match the selected filter."
            }
          />
        )}

        {/* =================================================
                    PAGINATION
                ================================================= */}

        {/* =================================================
    PAGINATION
================================================= */}

        {totalPages > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-3">
            <small className="text-secondary">
              Showing {startIndex + 1}
              {" – "}
              {Math.min(startIndex + PAGE_SIZE, sortedItems.length)}
              {" of "}
              {sortedItems.length}
            </small>

            <nav aria-label="Booking pagination">
              <ul className="pagination pagination-sm mb-0">
                {/* PREVIOUS */}
                <li className={`page-item ${safePage === 1 ? "disabled" : ""}`}>
                  <button
                    type="button"
                    className="page-link"
                    disabled={safePage === 1}
                    onClick={() => {
                      setPage((current) => Math.max(1, current - 1));
                    }}
                  >
                    Previous
                  </button>
                </li>

                {/* PAGE NUMBERS */}
                {pageNumbers.map((pageNumber) => (
                  <li
                    key={pageNumber}
                    className={`page-item ${
                      safePage === pageNumber ? "active" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="page-link"
                      onClick={() => {
                        setPage(pageNumber);
                      }}
                    >
                      {pageNumber}
                    </button>
                  </li>
                ))}

                {/* NEXT */}
                <li
                  className={`page-item ${
                    safePage === totalPages ? "disabled" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="page-link"
                    disabled={safePage === totalPages}
                    onClick={() => {
                      setPage((current) => Math.min(totalPages, current + 1));
                    }}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </Card>

      {rejectTarget && (
        <RejectBookingModal
          booking={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={() => {
            setRejectTarget(null);
            load();
          }}
        />
      )}
    </Page>
  );
}
