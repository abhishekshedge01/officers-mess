import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage, auth } from "../services/api";
import { ROLES } from "../constants";
import { Page, Card, Alert } from "../components/UI";

const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const routeFor = (role, key) => {
  if (role === ROLES.USER) {
    if (key === "pendingBills") return "/my-bills";
    if (key === "pendingBookings") return "/my-bookings";
    return "/my-bookings";
  }
  if (role === ROLES.ADMIN) return "/admin";
  if (key === "pendingManager") return "/manager/requests";
  if (
    [
      "totalRooms",
      "availableRooms",
      "approvedBookings",
      "checkedInBookings",
      "checkedOutBookings",
      "rejectedBookings",
      "totalBookings",
    ].includes(key)
  )
    return role === ROLES.MANAGER
      ? "/manager"
      : role === ROLES.SECRETARY
        ? "/secretary"
        : "/pmc";
  return "/";
};

export default function Dashboard() {
  const [d, setD] = useState(null),
    [r, setR] = useState(null),
    [e, setE] = useState("");
  const role = auth.user?.role;
  useEffect(() => {
    api
      .get("/dashboard")
      .then((x) => setD(x.data))
      .catch((x) => setE(errorMessage(x)));
    if ([ROLES.MANAGER, ROLES.PMC].includes(role))
      api
        .get("/revenue/overview")
        .then((x) => setR(x.data))
        .catch(() => {});
  }, [role]);
  const s = d?.statistics || {};
  const userStats =
    role === ROLES.USER
      ? [
          ["totalBookings", "Total bookings"],
          ["completedBookings", "Completed bookings"],
          ["pendingBookings", "Pending for approval"],
          ["pendingBills", "Bills pending payment"],
        ]
      : null;
  const moneyCard = r && (
    <div className="row g-3 mb-3">
      <div className="col-md-4">
        <Link
          to={role === ROLES.MANAGER ? "/manager/revenue" : "/pmc/revenue"}
          className="text-decoration-none"
        >
          <div className="revenue-metric">
            <div className="metric-icon">
              <i className="bi bi-cash-stack" />
            </div>
            <div>
              <div className="metric-label">This month</div>
              <div className="revenue-number">
                {money(r.month.grossRevenue)}
              </div>
              <small>{r.month.transactions} paid bills · View revenue →</small>
            </div>
          </div>
        </Link>
      </div>
      <div className="col-md-4">
        <Link
          to={role === ROLES.MANAGER ? "/manager/revenue" : "/pmc/revenue"}
          className="text-decoration-none"
        >
          <div className="revenue-metric">
            <div className="metric-icon">
              <i className="bi bi-graph-up-arrow" />
            </div>
            <div>
              <div className="metric-label">This year</div>
              <div className="revenue-number">{money(r.year.grossRevenue)}</div>
              <small>{r.year.transactions} verified payments</small>
            </div>
          </div>
        </Link>
      </div>
      <div className="col-md-4">
        <Link
          to={role === ROLES.MANAGER ? "/manager/revenue" : "/pmc/revenue"}
          className="text-decoration-none"
        >
          <div className="revenue-metric">
            <div className="metric-icon">
              <i className="bi bi-wallet2" />
            </div>
            <div>
              <div className="metric-label">Net this month</div>
              <div className="revenue-number">{money(r.month.netRevenue)}</div>
              <small>After gateway charges</small>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
  const currentUser = auth.user;
  return (
    <Page
      title="Dashboard"
      subtitle={`Welcome back, ${
        currentUser?.rank ? currentUser.rank + " " : ""
      }${currentUser?.name || "Officer"}.`}
    >
      {e && <Alert>{e}</Alert>}
      {moneyCard}
      {role === ROLES.USER ? (
        <div className="row g-3 dashboard-user-stats">
          {userStats.map(([key, label]) => (
            <div className="col-6 col-md-3" key={key}>
              <Link
                to={routeFor(role, key)}
                className="text-decoration-none text-dark"
              >
                <Card>
                  <div className="metric-label">{label}</div>
                  <div className="metric">{s[key] ?? 0}</div>
                  <small className="text-secondary">
                    {key === "pendingBills" ? "Open bills & payment →" : "Open my bookings →"}
                  </small>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="row g-3">
          {Object.entries(s).map(([k, v]) => (
            <div className="col-6 col-xl-3" key={k}>
              <Link
                to={routeFor(role, k)}
                className="text-decoration-none text-dark"
              >
                <Card>
                  <div className="metric-label">{k.replaceAll("_", " ")}</div>
                  <div className="metric">{v}</div>
                  <small className="text-secondary">Open details →</small>
                </Card>
              </Link>
            </div>
          ))}
        </div>
      )}
      <Card className="mt-3">
        <h5>Quick access</h5>
        <div className="d-flex gap-2 flex-wrap mt-3">
          {role === ROLES.USER && (
            <>
              <Link className="btn btn-dark" to="/book">
                Request accommodation
              </Link>
              <Link className="btn btn-outline-dark" to="/my-bookings">
                My stays
              </Link>
              <Link className="btn btn-outline-dark" to="/my-bills">
                Bills & payment
              </Link>
            </>
          )}
          {role === ROLES.ADMIN && (
            <Link className="btn btn-dark" to="/admin">
              Open Admin Console
            </Link>
          )}
          {role === ROLES.MANAGER && (
            <>
              <Link className="btn btn-dark" to="/manager/requests">
                Booking requests
              </Link>
              <Link className="btn btn-outline-dark" to="/manager">
                Operations
              </Link>
              <Link className="btn btn-outline-success" to="/manager/revenue">
                Revenue
              </Link>
            </>
          )}
          {role === ROLES.SECRETARY && (
            <>
              <Link className="btn btn-dark" to="/secretary/requests">
                Booking monitor
              </Link>
              <Link className="btn btn-outline-dark" to="/secretary">
                Occupancy
              </Link>
            </>
          )}
          {role === ROLES.PMC && (
            <>
              <Link className="btn btn-dark" to="/pmc">
                Mess operations
              </Link>
              <Link className="btn btn-outline-dark" to="/pmc/requests">
                Booking monitor
              </Link>
              <Link className="btn btn-outline-success" to="/pmc/revenue">
                Revenue
              </Link>
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}
