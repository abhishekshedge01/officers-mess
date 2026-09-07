import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { categoryName, fmtDate } from "../constants";
import { Page, Card, Alert, Empty, Badge, TableLoading } from "../components/UI";

export const getBookingBadge = (b) => {
  if (!b) return { type: "secondary", label: "UNKNOWN" };
  if (b.status === "CHECKED_IN") return { type: "checked-in", label: "CHECKED IN" };
  if (b.status === "CHECKED_OUT") {
    return b.paymentStatus === "PAID"
      ? { type: "payment-complete", label: "CHECKED OUT (PAID)" }
      : { type: "payment-pending", label: "CHECKED OUT" };
  }
  if (b.status === "APPROVED") return { type: "approved", label: "APPROVED" };
  if (b.status === "PENDING_MANAGER") return { type: "warning", label: "PENDING APPROVAL" };
  if (b.status === "CHECKOUT_REQUESTED") return { type: "checkout-requested", label: "CHECKOUT REQUESTED" };
  if (b.status === "USER_CANCELLED") return { type: "cancelled", label: "USER CANCELLED" };
  if (b.status === "NO_SHOW") return { type: "danger", label: "NO SHOW" };
  if (b.status === "CANCELLED") return { type: "cancelled", label: "CANCELLED" };
  if (b.status === "REJECTED") return { type: "rejected", label: "REJECTED" };
  return { type: "dark", label: String(b.status || "").replaceAll("_", " ") };
};

export function CancelBookingModal({ booking, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!booking) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErr("Please provide a reason for cancelling this booking.");
      return;
    }
    try {
      setBusy(true);
      setErr("");
      await api.patch(`/bookings/${booking._id}/cancel`, {
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
              Cancel Booking
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
                Are you sure you want to cancel your stay reservation from{" "}
                <strong>{fmtDate(booking.checkInDate)}</strong> to{" "}
                <strong>{fmtDate(booking.checkOutDate)}</strong>?
              </p>
              <p className="small text-secondary mb-3">
                Any earmarked room will be immediately released and made available for other officers.
              </p>
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Reason for Cancellation <span className="text-danger">*</span>
                </label>
                <textarea
                  className="form-control"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Unforeseen official duty, leave postponed, personal emergency..."
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
                Keep Booking
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                disabled={busy || !reason.trim()}
              >
                {busy ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function MyBookings() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("NEWEST");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/bookings/my");
      setItems(r.data.bookings || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let res = items.filter((b) => {
      if (!q) return true;
      const cat = categoryName(b.stayCategory).toLowerCase();
      const st = String(b.status || "").toLowerCase();
      const reason = String(b.cancellationReason || b.rejectionReason || "").toLowerCase();
      const dates = `${fmtDate(b.checkInDate)} ${fmtDate(b.checkOutDate)}`.toLowerCase();
      return cat.includes(q) || st.includes(q) || reason.includes(q) || dates.includes(q);
    });

    res.sort((a, b) => {
      if (sort === "OLDEST") {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      }
      if (sort === "CHECKIN_ASC") {
        return new Date(a.checkInDate || 0) - new Date(b.checkInDate || 0);
      }
      if (sort === "CHECKIN_DESC") {
        return new Date(b.checkInDate || 0) - new Date(a.checkInDate || 0);
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    return res;
  }, [items, search, sort]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE) || 1;
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, page]);

  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <Page
      title="My Stays"
      subtitle="View and track your Mess accommodation bookings"
      actions={
        <button
          type="button"
          className="btn btn-sm btn-outline-dark"
          onClick={load}
          disabled={loading}
          title="Refresh stays"
        >
          <i className={`bi bi-arrow-clockwise me-1 ${loading ? "spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {err && <Alert>{err}</Alert>}
      <Card>
        {/* Search & Sort bar */}
        <div className="row g-2 align-items-center mb-3">
          <div className="col-md-8">
            <div className="input-group">
              <span className="input-group-text bg-white text-secondary">
                <i className="bi bi-search" />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search stays by date, category, or status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => setSearch("")}
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>
          </div>
          <div className="col-md-4">
            <select
              className="form-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="NEWEST">Booking Date (Newest First)</option>
              <option value="OLDEST">Booking Date (Oldest First)</option>
              <option value="CHECKIN_ASC">Check-In Date (Upcoming First)</option>
              <option value="CHECKIN_DESC">Check-In Date (Latest First)</option>
            </select>
          </div>
        </div>

        {loading && !filteredItems.length ? (
          <TableLoading loading={true} />
        ) : !filteredItems.length ? (
          <Empty text={search ? "No bookings match your search." : "No bookings found yet."} />
        ) : (
          <TableLoading loading={loading}>
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>Dates</th>
                  <th>Category</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
              {paginatedItems.map((b) => {
                const badge = getBookingBadge(b);
                const canCancel = ["PENDING_MANAGER", "APPROVED"].includes(
                  b.status,
                );
                return (
                  <tr key={String(b._id)}>
                    <td>
                      {fmtDate(b.checkInDate)} → {fmtDate(b.checkOutDate)}
                      <small className="d-block text-secondary">
                        {b.nights} nights
                      </small>
                    </td>
                    <td>{categoryName(b.stayCategory)}</td>
                    <td>{b.numberOfGuests || b.stayMembers?.length || 0}</td>
                    <td>
                      <Badge type={badge.type}>{badge.label}</Badge>
                      {b.status === "USER_CANCELLED" && b.cancellationReason && (
                        <small className="d-block text-secondary mt-1 text-truncate" style={{ maxWidth: 180 }} title={b.cancellationReason}>
                          {b.cancellationReason}
                        </small>
                      )}
                      {b.status === "REJECTED" && b.rejectionReason && (
                        <small className="d-block text-secondary mt-1 text-truncate" style={{ maxWidth: 180 }} title={b.rejectionReason}>
                          Reason: {b.rejectionReason}
                        </small>
                      )}
                    </td>
                    <td className="text-end">
                      <Link
                        className="btn btn-sm btn-outline-dark me-2"
                        to={`/booking/${b._id}`}
                      >
                        View
                      </Link>
                      {canCancel && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setCancelTarget(b)}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableLoading>
      )}

        {totalPages > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
            <small className="text-secondary">
              Showing {(safePage - 1) * PAGE_SIZE + 1} to{" "}
              {Math.min(safePage * PAGE_SIZE, filteredItems.length)} of{" "}
              {filteredItems.length} entries
            </small>
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {cancelTarget && (
        <CancelBookingModal
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onSuccess={() => {
            setCancelTarget(null);
            load();
          }}
        />
      )}
    </Page>
  );
}

export function BookingDetail() {
  const { bookingId } = useParams();
  const [d, setD] = useState(null),
    [err, setErr] = useState(""),
    [ok, setOk] = useState(""),
    [busy, setBusy] = useState(false),
    [showCancelModal, setShowCancelModal] = useState(false);

  const load = () =>
    api
      .get(`/bookings/${bookingId}`)
      .then((r) => setD(r.data))
      .catch((e) => setErr(errorMessage(e)));

  useEffect(() => {
    load();
  }, [bookingId]);

  const requestCheckout = async () => {
    try {
      setBusy(true);
      setErr("");
      setOk("");
      const r = await api.patch(`/bookings/${bookingId}/request-checkout`);
      setOk(r.data?.message || "Checkout request sent to Manager.");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const b = d?.booking;
  const badge = b ? getBookingBadge(b) : null;
  const canCancel = b && ["PENDING_MANAGER", "APPROVED"].includes(b.status);

  return (
    <Page
      title="Stay details"
      subtitle="Booker, members, allocation and checkout."
    >
      {err && <Alert>{err}</Alert>}
      {ok && <Alert type="success">{ok}</Alert>}
      {b && (
        <div className="row g-3">
          <div className="col-lg-7">
            <Card>
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5>{b.booker?.name || "Stay request"}</h5>
                  <p>
                    {fmtDate(b.checkInDate)} → {fmtDate(b.checkOutDate)} ·{" "}
                    {categoryName(b.stayCategory)}
                  </p>
                </div>
                <Badge type={badge.type}>{badge.label}</Badge>
              </div>
              <h6>Booker</h6>
              <p>
                {b.booker?.name} · {b.booker?.serviceId || "No service No"} ·{" "}
                {b.booker?.mobile || "No mobile"}
              </p>
              <h6>People staying</h6>
              {(b.stayMembers || []).map((m, i) => (
                <div className="member-line" key={i}>
                  <b>{m.name}</b> · {m.memberType}
                  {m.isChild ? " · Child" : ""}
                  <small>
                    {m.relation || ""} {m.serviceId || ""}
                  </small>
                </div>
              ))}

              {canCancel && (
                <div className="mt-4 border-top pt-3">
                  <h6>Cancel booking</h6>
                  <p className="text-secondary small">
                    Need to cancel due to unforeseen reasons? You can cancel your stay before check-in. Any earmarked room will be made available for other officers.
                  </p>
                  <button
                    className="btn btn-outline-danger"
                    disabled={busy}
                    onClick={() => setShowCancelModal(true)}
                  >
                    <i className="bi bi-x-circle me-2" />
                    Cancel Booking
                  </button>
                </div>
              )}

              {b.status === "USER_CANCELLED" && (
                <div className="alert alert-secondary mt-4 mb-0">
                  <div className="fw-semibold">
                    <i className="bi bi-info-circle me-2" />
                    Stay request cancelled by you
                  </div>
                  {b.cancellationReason && (
                    <div className="mt-1 small">
                      <strong>Reason:</strong> {b.cancellationReason}
                    </div>
                  )}
                </div>
              )}

              {b.status === "NO_SHOW" && (
                <div className="alert alert-danger mt-4 mb-0">
                  <div className="fw-semibold">
                    <i className="bi bi-exclamation-triangle me-2" />
                    Marked as No Show
                  </div>
                  <div className="mt-1 small">
                    Check-in was not completed on the scheduled arrival date. The earmarked accommodation has been released.
                  </div>
                </div>
              )}

              {b.status === "REJECTED" && (
                <div className="alert alert-light border mt-4 mb-0">
                  <div className="fw-semibold text-danger">
                    <i className="bi bi-x-circle me-2" />
                    Stay request rejected
                  </div>
                  {b.rejectionReason ? (
                    <div className="mt-1 small text-dark">
                      <strong>Reason:</strong> {b.rejectionReason}
                    </div>
                  ) : (
                    <div className="mt-1 small text-secondary">
                      This booking request was rejected by the Mess administration.
                    </div>
                  )}
                </div>
              )}

              {b.status === "CHECKED_IN" && (
                <div className="mt-4 border-top pt-3">
                  <h6>Checkout</h6>
                  <p className="text-secondary">
                    You may request checkout. The Manager will verify the stay
                    and generate your final bill.
                  </p>
                  <button
                    className="btn btn-outline-warning text-dark"
                    disabled={busy}
                    onClick={requestCheckout}
                  >
                    <i className="bi bi-box-arrow-right me-2" />
                    {busy ? "Sending request…" : "Request Checkout"}
                  </button>
                </div>
              )}

              {b.status === "CHECKOUT_REQUESTED" && (
                <div className="alert alert-warning mt-4 mb-0">
                  Checkout request sent. Please wait for the Manager to approve
                  checkout and generate the final bill.
                </div>
              )}
              {b.status === "CHECKED_OUT" && (
                <div className="alert alert-success mt-4 mb-0">
                  Checkout completed. Open{" "}
                  <Link to="/my-bills">Bills & Payment</Link> to pay the final
                  bill and download your paid documents.
                </div>
              )}
            </Card>
          </div>

          <div className="col-lg-5">
            <Card>
              <div className="section-kicker">MESS ALLOCATION</div>
              <h5>Accommodation status</h5>
              <div className="alert alert-light border mt-3 mb-0">
                <i className="bi bi-shield-lock me-2" />
                The physical room number is managed by the Mess and is not
                displayed to the officer.
              </div>
            </Card>
          </div>
        </div>
      )}

      {showCancelModal && (
        <CancelBookingModal
          booking={b}
          onClose={() => setShowCancelModal(false)}
          onSuccess={() => {
            setShowCancelModal(false);
            load();
          }}
        />
      )}
    </Page>
  );
}
