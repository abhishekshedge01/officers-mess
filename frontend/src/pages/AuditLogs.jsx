import React, { useEffect, useState } from "react";
import { api, errorMessage } from "../services/api";
import { Page, Card, Alert, Empty } from "../components/UI";
import { exportToExcel } from "../utils/excelExport";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLogs = async (p = page, f = filter, s = search) => {
    try {
      setLoading(true);
      setErr("");
      const r = await api.get("/admin/audit-logs", {
        params: { page: p, limit: 20, filter: f, search: s },
      });
      setLogs(r.data.logs || []);
      setTotal(r.data.total || 0);
      setTotalPages(r.data.totalPages || 1);
      setPage(r.data.page || 1);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1, filter, search);
  }, [filter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadLogs(1, filter, search);
  };

  const handleExport = async () => {
    try {
      const r = await api.get("/admin/audit-logs/export");
      const allLogs = r.data.logs || [];
      if (!allLogs.length) {
        setErr("No audit records to export.");
        return;
      }
      const rows = allLogs.map((l) => ({
        Timestamp: new Date(l.timestamp).toLocaleString("en-IN"),
        "Event Type": l.eventType || "API_REQUEST",
        Method: l.method,
        "API Path": l.path,
        "Status Code": l.statusCode,
        "Duration (ms)": l.durationMs,
        Rank: l.user?.rank || "",
        "Officer Name": l.user?.name || "",
        "Service No": l.user?.serviceId || "",
        "User Email": l.user?.email || "Guest",
        "User Role": l.user?.role || "None",
        "Client IP": l.ip || "127.0.0.1",
        Description: l.description || "",
        "Failed API?": l.isError ? "YES" : "NO",
      }));
      exportToExcel(rows, `Audit_Logs_${new Date().toISOString().slice(0, 10)}`);
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Page
      title="Audit & API Monitoring"
      subtitle="Track real-time system activity, user logins, credential changes, and failing or broken APIs."
      actions={
        <button className="btn btn-success" onClick={handleExport}>
          <i className="bi bi-file-earmark-excel me-2" />
          Export to Excel
        </button>
      }
    >
      {err && <Alert>{err}</Alert>}

      {/* FILTERS & SEARCH */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <ul className="nav nav-pills om-bill-tabs">
          <li className="nav-item">
            <button
              className={`nav-link ${filter === "ALL" ? "active" : ""}`}
              onClick={() => setFilter("ALL")}
            >
              All Activity
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${filter === "ERRORS" ? "active" : ""}`}
              onClick={() => setFilter("ERRORS")}
            >
              Failing / Broken APIs
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${filter === "LOGINS" ? "active" : ""}`}
              onClick={() => setFilter("LOGINS")}
            >
              Logins & Auth
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${filter === "USERS" ? "active" : ""}`}
              onClick={() => setFilter("USERS")}
            >
              User Creations
            </button>
          </li>
        </ul>

        <form onSubmit={handleSearchSubmit} className="d-flex align-items-center gap-2">
          <div className="input-group">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Search path, user, error..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-outline-secondary btn-sm" type="submit">
              <i className="bi bi-search" />
            </button>
          </div>
          {search && (
            <button
              className="btn btn-link btn-sm text-secondary text-decoration-none"
              type="button"
              onClick={() => {
                setSearch("");
                loadLogs(1, filter, "");
              }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* LOGS TABLE (20 per page) */}
      <Card>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Timestamp</th>
                <th>Type</th>
                <th>Method & Endpoint</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Portfolio</th>
                <th>Officer Details</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const isErr = log.isError || (log.statusCode && log.statusCode >= 400);
                return (
                  <tr key={log._id} className={isErr ? "table-danger-subtle" : ""}>
                    <td className="small text-nowrap text-secondary">
                      {new Date(log.timestamp).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          log.eventType === "API_ERROR"
                            ? "bg-danger"
                            : log.eventType === "USER_LOGIN_SUCCESS"
                            ? "bg-success"
                            : log.eventType === "USER_LOGIN_FAILED"
                            ? "bg-warning text-dark"
                            : log.eventType === "USER_CREATED"
                            ? "bg-primary"
                            : "bg-secondary"
                        }`}
                      >
                        {log.eventType || "API"}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className={`badge ${
                            log.method === "GET"
                              ? "bg-info text-dark"
                              : log.method === "POST"
                              ? "bg-primary"
                              : log.method === "PUT"
                              ? "bg-warning text-dark"
                              : log.method === "DELETE"
                              ? "bg-danger"
                              : "bg-secondary"
                          }`}
                          style={{ fontSize: "0.7rem", width: "48px" }}
                        >
                          {log.method}
                        </span>
                        <span className="font-monospace small text-truncate" style={{ maxWidth: "240px" }}>
                          {log.path}
                        </span>
                      </div>
                      {log.description && (
                        <div className="small text-danger mt-1 font-monospace" style={{ fontSize: "0.75rem" }}>
                          {log.description}
                        </div>
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          !log.statusCode
                            ? "bg-secondary"
                            : log.statusCode < 300
                            ? "bg-success"
                            : log.statusCode < 400
                            ? "bg-info text-dark"
                            : log.statusCode < 500
                            ? "bg-warning text-dark"
                            : "bg-danger"
                        }`}
                      >
                        {log.statusCode || "---"}
                      </span>
                    </td>
                    <td className="small text-secondary">
                      {log.durationMs != null ? `${log.durationMs} ms` : "--"}
                    </td>

                    {/* PORTFOLIO IN PLAIN TEXT */}
                    <td>
                      <span className="fw-semibold text-dark">
                        {log.user?.role ? String(log.user.role).replace("_", " ") : "Guest / System"}
                      </span>
                    </td>

                    {/* PERSONAL DETAILS: SERVICE NO ON TOP, RANK AND NAME BELOW ALL IN PLAIN TEXT */}
                    <td>
                      {log.user ? (
                        <div>
                          <div className="small text-secondary">
                            Service No: {log.user.serviceId || "—"}
                          </div>
                          <div className="fw-semibold text-dark">
                            {log.user.rank ? `${log.user.rank} ` : ""}
                            {log.user.name || log.user.email || "—"}
                          </div>
                          {log.user.email && log.user.email !== log.user.name && (
                            <div className="small text-muted">{log.user.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-secondary small">—</span>
                      )}
                    </td>

                    <td className="small font-monospace text-secondary">{log.ip || "--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!logs.length && !loading && (
          <div className="py-4">
            <Empty text="No audit log records found for this view." />
          </div>
        )}

        {/* PAGINATION (20 per page) */}
        {totalPages > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
            <span className="small text-secondary">
              Showing {logs.length} of {total} total records (Page {page} of {totalPages})
            </span>
            <div className="btn-group btn-group-sm">
              <button
                className="btn btn-outline-dark"
                disabled={page <= 1}
                onClick={() => loadLogs(page - 1)}
              >
                Previous
              </button>
              <button className="btn btn-dark disabled">{page}</button>
              <button
                className="btn btn-outline-dark"
                disabled={page >= totalPages}
                onClick={() => loadLogs(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </Page>
  );
}
