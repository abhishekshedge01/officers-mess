import React, { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../services/api";
import { categoryName } from "../constants";
import { exportRevenueToExcel } from "../utils/excelExport";
import { Page, Card, Alert, Badge, Empty, TableLoading } from "../components/UI";

/* =========================================================
   HELPERS
========================================================= */

const money = (n) => {
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const currentMonth = () => {
  const d = new Date();

  const month = String(d.getMonth() + 1).padStart(2, "0");

  return `${d.getFullYear()}-${month}`;
};

const currentYear = () => {
  return String(new Date().getFullYear());
};

/* =========================================================
   REVENUE SOURCE COLORS
========================================================= */

const PIE_COLORS = [
  "#10213a",
  "#2f8f4e",
  "#c9961a",
  "#6b4bb6",
  "#2563eb",
  "#d64545",
];
/* =========================================================
   METRIC CARD
========================================================= */

function Metric({ label, value, sub, icon, tone }) {
  return (
    <div className="col-sm-6 col-xl-3">
      <div className={`revenue-metric revenue-metric-${tone || "navy"}`}>
        <div className="metric-icon">
          <i className={`bi bi-${icon}`} />
        </div>

        <div>
          <div className="metric-label">{label}</div>

          <div className="revenue-number">{value}</div>

          {sub && <small>{sub}</small>}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   DONUT CHART
========================================================= */

function DonutChart({ categories }) {
  const total = categories.reduce(
    (sum, item) => sum + Number(item.revenue || 0),
    0,
  );

  const slices = useMemo(() => {
    if (!total) {
      return [];
    }

    let cumulative = 0;

    return categories.map((item, index) => {
      const value = Number(item.revenue || 0);

      const start = (cumulative / total) * 360;

      cumulative += value;

      const end = (cumulative / total) * 360;

      return {
        ...item,
        value,
        start,
        end,
        percent: (value / total) * 100,
        color: PIE_COLORS[index % PIE_COLORS.length],
      };
    });
  }, [categories, total]);

  /* -------------------------------------------------------
     POLAR COORDINATES
  ------------------------------------------------------- */

  const polar = (angle, radius = 82) => {
    const rad = ((angle - 90) * Math.PI) / 180;

    return {
      x: 100 + radius * Math.cos(rad),

      y: 100 + radius * Math.sin(rad),
    };
  };

  /* -------------------------------------------------------
     CREATE SVG SLICE
  ------------------------------------------------------- */

  const pathFor = (start, end) => {
    /* Full circle */
    if (end - start >= 359.99) {
      return "M 100 18 " + "A 82 82 0 1 1 99.99 18";
    }

    const s = polar(start);

    const e = polar(end);

    const large = end - start > 180 ? 1 : 0;

    return `
      M 100 100
      L ${s.x} ${s.y}
      A 82 82 0 ${large} 1 ${e.x} ${e.y}
      Z
    `;
  };

  /* -------------------------------------------------------
     EMPTY STATE
  ------------------------------------------------------- */

  if (!categories.length || !total) {
    return <Empty text="No paid transactions this year." />;
  }

  return (
    <div className="revenue-category-chart">
      {/* ===================================================
          DONUT
      =================================================== */}

      <div className="donut-wrap">
        <svg
          className="donut-svg"
          viewBox="0 0 200 200"
          role="img"
          aria-label="Revenue by category"
        >
          {slices.map((slice, index) => (
            <path
              key={`${slice.category}-${index}`}
              d={pathFor(slice.start, slice.end)}
              fill={slice.color}
              stroke="#fff"
              strokeWidth="2"
            />
          ))}

          {/* White center */}

          <circle cx="100" cy="100" r="51" fill="#fff" />

          {/* Total percentage */}

          <text x="100" y="96" textAnchor="middle" className="donut-percent">
            100%
          </text>

          {/* Center label */}

          <text
            x="100"
            y="116"
            textAnchor="middle"
            className="donut-center-label"
          >
            TOTAL
          </text>
        </svg>
      </div>

      {/* ===================================================
          REVENUE SOURCE LEGEND
      =================================================== */}

      <div className="category-legend">
        {slices.map((item, index) => (
          <div
            className="category-legend-item"
            key={`${item.category}-${index}`}
          >
            <span
              className="category-dot"
              style={{
                background: item.color,
              }}
            />

            <div className="category-legend-copy">
              <strong>{categoryName(item.category)}</strong>

              <small>
                {item.transactions} payment(s)
                {" · "}
                {item.percent.toFixed(item.percent < 10 ? 1 : 0)}%
              </small>

              <b>{money(item.revenue)}</b>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =========================================================
   REVENUE PAGE
========================================================= */

export default function Revenue() {
  const [data, setData] = useState(null);

  const [month, setMonth] = useState(currentMonth());

  const [year, setYear] = useState(currentYear());

  const [err, setErr] = useState("");

  const [loading, setLoading] = useState(true);

  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentSort, setPaymentSort] = useState("NEWEST");
  const [paymentPage, setPaymentPage] = useState(1);
  const [expandedPaymentId, setExpandedPaymentId] = useState(null);

  const PAYMENT_PAGE_SIZE = 20;

  /* =======================================================
     LOAD REVENUE DATA
  ======================================================= */

  const load = () => {
    setLoading(true);
    setErr("");

    api
      .get("/revenue/overview", {
        params: {
          month,
          year,
        },
      })

      .then((response) => {
        setData(response.data);
      })

      .catch((error) => {
        setErr(errorMessage(error));
      })

      .finally(() => {
        setLoading(false);
      });
  };

  /* =======================================================
     LOAD WHEN MONTH/YEAR CHANGES
  ======================================================= */

  useEffect(() => {
    load();
  }, [month, year]);

  useEffect(() => {
    setPaymentPage(1);
  }, [month, year, paymentSearch, paymentSort]);

  /* =======================================================
     CATEGORY DATA
  ======================================================= */

  const categories = useMemo(() => data?.categoryBreakdown || [], [data]);
  const sortedPayments = useMemo(() => {
    const raw = data?.recentPayments || [];
    const q = paymentSearch.trim().toLowerCase();
    const filtered = raw.filter((p) => {
      if (!q) return true;
      const name = String(p.name || "").toLowerCase();
      const rank = String(p.rank || "").toLowerCase();
      const serviceId = String(p.serviceId || "").toLowerCase();
      const email = String(p.email || "").toLowerCase();
      const bookingId = String(p.bookingId || "").toLowerCase();
      const paymentId = String(p.paymentId || "").toLowerCase();
      const cat = categoryName(p.stayCategory).toLowerCase();
      return (
        name.includes(q) ||
        rank.includes(q) ||
        serviceId.includes(q) ||
        email.includes(q) ||
        bookingId.includes(q) ||
        paymentId.includes(q) ||
        cat.includes(q)
      );
    });

    return filtered.sort((a, b) => {
      switch (paymentSort) {
        case "NEWEST":
          return (
            new Date(b.paidAt || 0).getTime() -
            new Date(a.paidAt || 0).getTime()
          );

        case "OLDEST":
          return (
            new Date(a.paidAt || 0).getTime() -
            new Date(b.paidAt || 0).getTime()
          );

        case "NAME_ASC":
          return String(a.name || "").localeCompare(String(b.name || ""));

        case "NAME_DESC":
          return String(b.name || "").localeCompare(String(a.name || ""));

        case "RANK_ASC":
          return String(a.rank || "").localeCompare(String(b.rank || ""));

        case "AMOUNT_HIGH":
          return Number(b.amount || 0) - Number(a.amount || 0);

        case "AMOUNT_LOW":
          return Number(a.amount || 0) - Number(b.amount || 0);

        default:
          return 0;
      }
    });
  }, [data?.recentPayments, paymentSearch, paymentSort]);

  const paymentTotalPages = Math.max(
    1,
    Math.ceil(sortedPayments.length / PAYMENT_PAGE_SIZE),
  );

  const safePaymentPage = Math.min(paymentPage, paymentTotalPages);

  const paymentStartIndex = (safePaymentPage - 1) * PAYMENT_PAGE_SIZE;

  const paymentPageItems = sortedPayments.slice(
    paymentStartIndex,
    paymentStartIndex + PAYMENT_PAGE_SIZE,
  );

  const paymentPageNumbers = Array.from(
    { length: paymentTotalPages },
    (_, index) => index + 1,
  );

  const handleExportRevenue = () => {
    const recentPayments = (data?.recentPayments || []).map((item) => ({
      "Paid On": item.paidAt
        ? new Date(item.paidAt).toLocaleString("en-IN")
        : "",
      Rank: item.rank || "",
      Officer: item.name || "",
      "Service No": item.serviceId || "",
      Email: item.email || "",
      Mobile: item.mobile || "",
      Booking: item.bookingId || "",
      Category: categoryName(item.category),
      "Payment ID": item.paymentId || "",
      Amount: Number(item.amount || 0),
      Status: "Paid",
    }));

    const monthlyRevenue = (data?.monthlySeries || []).map((item) => ({
      Month: item.label || item.month || "",
      Revenue: Number(item.revenue || 0),
    }));

    exportRevenueToExcel(
      recentPayments,
      monthlyRevenue,
      `Mess_Revenue_${month}`,
    );
  };

  /* =======================================================
     PAGE
  ======================================================= */

  return (
    <Page
      title="Mess revenue"
      subtitle="A live financial view of paid stays, gateway charges and net revenue for your assigned Officers Mess."

      actions={
        <div className="revenue-filters">
          <input
            type="month"
            className="form-control"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />

          <input
            type="number"
            className="form-control revenue-year"
            min="2000"
            max="2100"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
      }
    >
      {/* ===================================================
          ERROR
      =================================================== */}

      {err && <Alert>{err}</Alert>}

      {/* ===================================================
          LOADING
      =================================================== */}

      {loading && !data ? (
        <Card>
          <div className="loading-state">
            <span className="spinner-border" />
            Loading revenue…
          </div>
        </Card>
      ) : (
        data && (
          <>
            {/* =================================================
                TOP REVENUE METRICS
            ================================================= */}

            <div className="row g-3 mb-3">
              {/* THIS MONTH */}

              <Metric
                label="This month"
                value={money(data.month.grossRevenue)}
                sub={`${data.month.transactions} paid bills`}
                icon="cash-stack"
                tone="navy"
              />

              {/* THIS YEAR */}

              <Metric
                label="This year"
                value={money(data.year.grossRevenue)}
                sub={`${data.year.transactions} paid bills`}
                icon="graph-up-arrow"
                tone="green"
              />

              {/* GATEWAY */}

              <Metric
                label="Payment gateway charges"
                value={money(data.month.gatewayCharges)}
                sub={
                  data.month.gatewayChargesSource === "OFFLINE_DEMO"
                    ? "Offline demo — ₹0 gateway charges"
                    : "Recorded gateway charges"
                }
                icon="credit-card-2-front"
                tone="purple"
              />

              {/* NET REVENUE */}

              <Metric
                label="Net revenue"
                value={money(data.month.netRevenue)}
                sub="After gateway charges"
                icon="wallet2"
                tone="gold"
              />
            </div>

            {/* =================================================
                MONTHLY REVENUE + REVENUE SOURCE
            ================================================= */}

            <div className="row g-3">
              {/* ===============================================
                  MONTHLY REVENUE
              =============================================== */}

              <div className="col-xl-8">
                <Card>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h5 className="mb-0">
                        Monthly revenue · {data.period.year}
                      </h5>

                      <small className="text-secondary">
                        Only verified PAID transactions are counted as revenue.
                      </small>
                    </div>

                    <Badge type="success">Live</Badge>
                  </div>

                  <div className="revenue-chart">
                    {data.monthlySeries.map((item) => {
                      const max = Math.max(
                        ...(data.monthlySeries || []).map((x) =>
                          Number(x.revenue || 0),
                        ),
                        1,
                      );

                      const height = Math.max(
                        4,
                        (Number(item.revenue || 0) / max) * 150,
                      );

                      return (
                        <div
                          className="revenue-bar-wrap"
                          key={item.month}
                          title={`${item.label}: ${money(item.revenue)}`}
                        >
                          <div
                            className="revenue-bar"
                            style={{
                              height: `${height}px`,
                            }}
                          >
                            {item.revenue ? (
                              <span>
                                {money(item.revenue).replace(".00", "")}
                              </span>
                            ) : null}
                          </div>

                          <small>{item.label}</small>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* ===============================================
                  REVENUE BY CATEGORY / SOURCE
              =============================================== */}

              <div className="col-xl-4">
                <Card className="revenue-category-card">
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <h5 className="mb-1">Revenue by category</h5>

                      <small className="text-secondary">
                        Revenue source for paid room stays.
                      </small>
                    </div>

                    <div className="chart-header-icon">
                      <i className="bi bi-pie-chart" />
                    </div>
                  </div>

                  <DonutChart categories={categories} />
                </Card>
              </div>
            </div>

            {/* =================================================
                SUMMARY CARDS
            ================================================= */}

            <div className="row g-3 mt-0">
              {/* ===============================================
                  PENDING PAYMENTS
              =============================================== */}

              <div className="col-lg-4">
                <Card className="revenue-summary-card pending-summary">
                  <div className="summary-icon">
                    <i className="bi bi-file-earmark-text" />
                  </div>

                  <div>
                    <h6>Pending payments</h6>

                    <div className="display-6 mt-2">
                      {money(data.month.pendingAmount)}
                    </div>

                    <small className="text-secondary">
                      Billed but not yet received. Not included in revenue.
                    </small>
                  </div>
                </Card>
              </div>

              {/* ===============================================
                  EXTRA CHARGES
              =============================================== */}

              <div className="col-lg-4">
                <Card className="revenue-summary-card extra-summary">
                  <div className="summary-icon">
                    <i className="bi bi-file-earmark-plus" />
                  </div>

                  <div>
                    <h6>Extra charges received</h6>

                    <div className="display-6 mt-2">
                      {money(data.month.extraChargesRevenue)}
                    </div>

                    <small className="text-secondary">
                      Additional approved charges included in paid bills.
                    </small>
                  </div>
                </Card>
              </div>

              {/* ===============================================
                  YEAR NET REVENUE
              =============================================== */}

              <div className="col-lg-4">
                <Card className="revenue-summary-card year-summary">
                  <div className="summary-icon">
                    <i className="bi bi-wallet2" />
                  </div>

                  <div>
                    <h6>Year net revenue</h6>

                    <div className="display-6 mt-2">
                      {money(data.year.netRevenue)}
                    </div>

                    <small className="text-secondary">
                      Gross yearly receipts less recorded/estimated gateway
                      charges.
                    </small>
                  </div>
                </Card>
              </div>
            </div>

            {/* =================================================
                RECENT PAYMENTS
            ================================================= */}

            <Card className="mt-3 recent-payments-card">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                  <h5 className="mb-0">Recent payments</h5>

                  <small className="text-secondary">
                    Verified offline payments received by this Mess.
                  </small>
                </div>

                <div className="modify d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleExportRevenue}
                    disabled={!data}
                  >
                    <i className="bi bi-file-earmark-excel me-2"></i>
                    Export Revenue to Excel
                  </button>

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-dark"
                    onClick={load}
                  >
                    <i className="bi bi-arrow-clockwise me-1" />
                    Refresh
                  </button>
                </div>
              </div>

              {data.recentPayments?.length > 0 ? (
                <>
                  <div className="row g-2 mb-3">
                    <div className="col-md-5">
                      <label className="form-label small fw-semibold">Search</label>
                      <div className="input-group">
                        <span className="input-group-text bg-white text-secondary">
                          <i className="bi bi-search" />
                        </span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search payments by officer, ID..."
                          value={paymentSearch}
                          onChange={(e) => {
                            setPaymentSearch(e.target.value);
                            setPaymentPage(1);
                          }}
                        />
                        {paymentSearch && (
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => {
                              setPaymentSearch("");
                              setPaymentPage(1);
                            }}
                          >
                            <i className="bi bi-x" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label small fw-semibold">
                        Sort by
                      </label>

                      <select
                        className="form-select"
                        value={paymentSort}
                        onChange={(e) => {
                          setPaymentSort(e.target.value);
                          setPaymentPage(1);
                        }}
                      >
                        <option value="NEWEST">Newest payment</option>
                        <option value="OLDEST">Oldest payment</option>
                        <option value="NAME_ASC">Officer name A → Z</option>
                        <option value="NAME_DESC">Officer name Z → A</option>
                        <option value="RANK_ASC">Rank A → Z</option>
                        <option value="AMOUNT_HIGH">Amount high → low</option>
                        <option value="AMOUNT_LOW">Amount low → high</option>
                      </select>
                    </div>

                    <div className="col-md-3 d-flex align-items-end justify-content-end">
                      <small className="text-secondary">
                        Showing{" "}
                        {sortedPayments.length ? paymentStartIndex + 1 : 0} –{" "}
                        {Math.min(
                          paymentStartIndex + PAYMENT_PAGE_SIZE,
                          sortedPayments.length,
                        )}{" "}
                        of {sortedPayments.length} payments
                      </small>
                    </div>
                  </div>

                  <TableLoading loading={loading}>
                    <table className="table align-middle revenue-table table-hover">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}></th>
                          <th>Paid On</th>
                          <th>Rank</th>
                          <th>Officer Name</th>
                          <th>Booking ID</th>
                          <th>Category</th>
                          <th>Payment ID</th>
                          <th className="text-end">Amount</th>
                          <th>Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {paymentPageItems.map((item) => {
                          const rowKey = String(item.id || item.paymentId || item.bookingId);
                          const isExpanded = expandedPaymentId === rowKey;

                          return (
                            <React.Fragment key={rowKey}>
                              <tr
                                onClick={() => setExpandedPaymentId(isExpanded ? null : rowKey)}
                                style={{ cursor: "pointer" }}
                                className={isExpanded ? "table-active" : ""}
                                title="Click to view detailed payment & guest stay breakdown"
                              >
                                <td className="text-center text-secondary pe-0">
                                  <i className={`bi ${isExpanded ? "bi-chevron-down text-primary" : "bi-chevron-right"}`} />
                                </td>

                                <td className="text-nowrap">
                                  {item.paidAt ? (
                                    <>
                                      <div>
                                        {new Date(item.paidAt).toLocaleDateString("en-IN")}
                                      </div>
                                      <small className="text-secondary">
                                        {new Date(item.paidAt).toLocaleTimeString("en-IN", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                          second: "2-digit",
                                          hour12: true,
                                        })}
                                      </small>
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </td>

                                <td>
                                  {item.rank ? (
                                    <span className="badge bg-light text-dark border fw-semibold">
                                      {item.rank}
                                    </span>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>

                                <td>
                                  <strong>{item.name || "Guest"}</strong>
                                  {item.serviceId && (
                                    <small className="d-block text-secondary font-monospace">
                                      {item.serviceId}
                                    </small>
                                  )}
                                </td>

                                <td>
                                  <code>{String(item.bookingId || "").slice(-8) || "—"}</code>
                                </td>

                                <td>{categoryName(item.category)}</td>

                                <td>
                                  <code>{item.paymentId || "—"}</code>
                                </td>

                                <td className="text-end fw-semibold">
                                  {money(item.amount)}
                                </td>

                                <td>
                                  <span className="payment-status-paid">
                                    <i className="bi bi-check-circle-fill me-1"></i>
                                    Paid
                                  </span>
                                </td>
                              </tr>

                              {isExpanded && (
                                <tr className="revenue-expanded-row bg-light border-bottom">
                                  <td colSpan={9} className="p-3">
                                    <div className="card shadow-sm border-0 bg-white">
                                      <div className="card-body p-3">
                                        <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                                          <div className="d-flex align-items-center gap-2">
                                            <i className="bi bi-person-badge fs-5 text-primary"></i>
                                            <span className="fw-bold">
                                              {item.rank ? `${item.rank} ` : ""}
                                              {item.name || "Guest"}
                                            </span>
                                            {item.serviceId && (
                                              <span className="badge text-bg-dark font-monospace">
                                                No: {item.serviceId}
                                              </span>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            className="btn-close btn-sm"
                                            aria-label="Close"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setExpandedPaymentId(null);
                                            }}
                                          />
                                        </div>

                                        <div className="row g-3 small">
                                          <div className="col-sm-6 col-md-3">
                                            <span className="text-secondary d-block">Officer / User Details</span>
                                            <div className="fw-semibold mt-1">
                                              {item.rank ? `${item.rank} ` : ""}{item.name || "Guest"}
                                            </div>
                                            {item.serviceId && (
                                              <div className="text-secondary font-monospace">Service No: {item.serviceId}</div>
                                            )}
                                            {item.email && <div className="text-muted">{item.email}</div>}
                                            {item.mobile && <div className="text-muted">{item.mobile}</div>}
                                          </div>

                                          <div className="col-sm-6 col-md-3">
                                            <span className="text-secondary d-block">Stay & Accommodation</span>
                                            <div className="fw-semibold mt-1">
                                              Category: {categoryName(item.category)}
                                            </div>
                                            <div>Room: {item.roomNumber ? `Room ${item.roomNumber}` : "Allotted at stay"}</div>
                                            <div>Duration: {item.nights || 1} Night(s)</div>
                                            {item.checkInDate && (
                                              <div className="text-secondary">
                                                Dates: {new Date(item.checkInDate).toLocaleDateString("en-IN")}
                                                {item.checkOutDate ? ` → ${new Date(item.checkOutDate).toLocaleDateString("en-IN")}` : ""}
                                              </div>
                                            )}
                                          </div>

                                          <div className="col-sm-6 col-md-3">
                                            <span className="text-secondary d-block">Payment & Transaction</span>
                                            <div className="fw-bold text-success mt-1 fs-6">
                                              {money(item.amount)}
                                            </div>
                                            <div className="font-monospace text-truncate" title={item.paymentId}>
                                              Payment ID: {item.paymentId || "—"}
                                            </div>
                                            {item.billId && (
                                              <div className="text-secondary">Bill ID: {String(item.billId).slice(-8)}</div>
                                            )}
                                            {item.invoiceNumber && (
                                              <div className="text-secondary">Invoice: {item.invoiceNumber}</div>
                                            )}
                                          </div>

                                          <div className="col-sm-6 col-md-3">
                                            <span className="text-secondary d-block">Booking Reference</span>
                                            <div className="font-monospace fw-semibold mt-1">
                                              {item.bookingId || "—"}
                                            </div>
                                            <div className="mt-1">
                                              <span className="badge bg-success-subtle text-success border border-success-subtle">
                                                <i className="bi bi-check-circle me-1" />
                                                Verified Paid
                                              </span>
                                            </div>
                                            {item.paidAt && (
                                              <div className="text-secondary mt-1">
                                                Paid on {new Date(item.paidAt).toLocaleString("en-IN")}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableLoading>

                  {paymentTotalPages > 1 && (
                    <div className="d-flex justify-content-between align-items-center mt-3">
                      <small className="text-secondary">
                        Showing {paymentStartIndex + 1} –{" "}
                        {Math.min(
                          paymentStartIndex + PAYMENT_PAGE_SIZE,
                          sortedPayments.length,
                        )}{" "}
                        of {sortedPayments.length}
                      </small>

                      <nav aria-label="Recent payments pagination">
                        <ul className="pagination pagination-sm mb-0">
                          <li
                            className={`page-item ${
                              safePaymentPage === 1 ? "disabled" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="page-link"
                              disabled={safePaymentPage === 1}
                              onClick={() =>
                                setPaymentPage((current) =>
                                  Math.max(1, current - 1),
                                )
                              }
                            >
                              Previous
                            </button>
                          </li>

                          {paymentPageNumbers.map((number) => (
                            <li
                              key={number}
                              className={`page-item ${
                                safePaymentPage === number ? "active" : ""
                              }`}
                            >
                              <button
                                type="button"
                                className="page-link"
                                onClick={() => setPaymentPage(number)}
                              >
                                {number}
                              </button>
                            </li>
                          ))}

                          <li
                            className={`page-item ${
                              safePaymentPage === paymentTotalPages
                                ? "disabled"
                                : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="page-link"
                              disabled={safePaymentPage === paymentTotalPages}
                              onClick={() =>
                                setPaymentPage((current) =>
                                  Math.min(paymentTotalPages, current + 1),
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
                </>
              ) : (
                <Empty text="No payments in the selected month." />
              )}
            </Card>
          </>
        )
      )}
    </Page>
  );
}
