import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { Page, Card, Field, Alert, Badge, Empty, TableLoading } from "../components/UI";
import { fmtDate } from "../constants";

const blankPMC = {
  serviceId: "",
  rank: "",
  name: "",
  email: "",
  password: "",
  mobile: "",
};

export default function AdminPMC() {
  const [searchParams] = useSearchParams();
  const [messes, setMesses] = useState([]);
  const [selectedMessId, setSelectedMessId] = useState("");
  const [pf, setPf] = useState(blankPMC);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [existingPmcId, setExistingPmcId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  // Table controls
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("NAME_ASC");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/messes");
      const list = res.data?.messes || res.data || [];
      setMesses(list);
      return list;
    } catch (e) {
      setErr(errorMessage(e));
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().then((list) => {
      const paramMessId = searchParams.get("messId");
      if (paramMessId && list.some((m) => String(m._id) === String(paramMessId))) {
        handleMessSelect(paramMessId, list);
        setTimeout(() => {
          document.getElementById("pmc-form-panel")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 100);
      }
    });
  }, [searchParams]);

  // When selected mess changes, populate or reset PMC form
  const handleMessSelect = (messId, messList = messes) => {
    setSelectedMessId(messId);
    setErr("");
    setOk("");

    if (!messId) {
      setPf(blankPMC);
      setIsEditingExisting(false);
      setExistingPmcId(null);
      return;
    }

    const mess = messList.find((m) => String(m._id) === String(messId));
    if (mess?.pmc) {
      setIsEditingExisting(true);
      setExistingPmcId(mess.pmc._id || mess.pmc.id);
      setPf({
        serviceId: mess.pmc.serviceId || "",
        rank: mess.pmc.rank || "",
        name: mess.pmc.name || "",
        email: mess.pmc.email || "",
        mobile: mess.pmc.mobile || "",
        password: "",
      });
    } else {
      setIsEditingExisting(false);
      setExistingPmcId(null);
      setPf(blankPMC);
    }
  };

  const handleSavePMC = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!selectedMessId) {
      setErr("Please select an Officers Mess.");
      return;
    }

    setLoading(true);
    try {
      if (isEditingExisting && existingPmcId) {
        // Update existing PMC
        const updatePayload = {
          name: pf.name.trim(),
          serviceId: pf.serviceId.trim(),
          rank: pf.rank.trim(),
          mobile: pf.mobile.trim(),
          email: pf.email.toLowerCase().trim(),
        };
        if (pf.password) {
          updatePayload.password = pf.password;
        }

        await api.patch(`/admin/users/${existingPmcId}`, updatePayload);
        setOk(`PMC details for "${selectedMess?.name || "Mess"}" updated successfully.`);
      } else {
        // Create new PMC and link to mess
        const createPayload = {
          messId: selectedMessId,
          serviceId: pf.serviceId.trim(),
          rank: pf.rank.trim(),
          name: pf.name.trim(),
          email: pf.email.toLowerCase().trim(),
          mobile: pf.mobile.trim(),
          password: pf.password || undefined,
        };

        const r = await api.post("/admin/pmcs", createPayload);
        setOk(
          `PMC ${r.data?.pmc?.name || ""} created and linked successfully to "${selectedMess?.name || "selected mess"}".`,
        );
      }

      window.scrollTo({ top: 0, behavior: "smooth" });
      const updatedMesses = await load();
      handleMessSelect(selectedMessId, updatedMesses);
    } catch (e) {
      setErr(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  const selectedMess = messes.find(
    (m) => String(m._id) === String(selectedMessId),
  );

  // Table filtering and sorting
  const filteredMesses = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = messes.filter((m) => {
      if (!q) return true;
      const name = String(m.name || "").toLowerCase();
      const loc = String(m.location || m.city || "").toLowerCase();
      const addr = String(m.address || "").toLowerCase();
      const pmcName = String(m.pmc?.name || "").toLowerCase();
      const pmcService = String(m.pmc?.serviceId || "").toLowerCase();
      const pmcEmail = String(m.pmc?.email || "").toLowerCase();
      return (
        name.includes(q) ||
        loc.includes(q) ||
        addr.includes(q) ||
        pmcName.includes(q) ||
        pmcService.includes(q) ||
        pmcEmail.includes(q)
      );
    });

    result.sort((a, b) => {
      switch (sort) {
        case "NAME_ASC":
          return String(a.name || "").localeCompare(String(b.name || ""));
        case "NAME_DESC":
          return String(b.name || "").localeCompare(String(a.name || ""));
        case "LOCATION_ASC":
          return String(a.location || a.city || "").localeCompare(
            String(b.location || b.city || ""),
          );
        case "PMC_LINKED":
          return (b.pmc ? 1 : 0) - (a.pmc ? 1 : 0);
        case "PMC_PENDING":
          return (a.pmc ? 1 : 0) - (b.pmc ? 1 : 0);
        default:
          return 0;
      }
    });

    return result;
  }, [messes, search, sort]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredMesses.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedMesses = filteredMesses.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <Page
      title="PMC Management"
      subtitle="Select an Officers Mess to assign or update its Presiding Officer Mess Committee (PMC)."
    >
      {ok && <Alert type="success">{ok}</Alert>}
      {err && <Alert>{err}</Alert>}

      <div className="row g-4">
        <div className="col-lg-6">
          <Card id="pmc-form-panel">
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-person-badge fs-4 text-primary" />
              <div>
                <h5 className="mb-0">
                  {isEditingExisting ? "Update PMC Details" : "Assign & Link PMC"}
                </h5>
                <small className="text-secondary">
                  Choose a mess from the dropdown below to view, link, or edit PMC details.
                </small>
              </div>
            </div>

            <form onSubmit={handleSavePMC}>
              {/* MESS SELECTOR DROPDOWN */}
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Select Officers Mess <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  value={selectedMessId}
                  onChange={(e) => handleMessSelect(e.target.value)}
                  required
                >
                  <option value="">-- Choose an Officers Mess --</option>
                  {messes.map((m) => (
                    <option key={String(m._id)} value={String(m._id)}>
                      {m.name} ({m.city || m.location || "No Station"}){" "}
                      {m.pmc ? `[PMC: ${m.pmc.name}]` : "[No PMC Linked]"}
                    </option>
                  ))}
                </select>
              </div>

              {selectedMess && (
                <div
                  className={`alert ${
                    isEditingExisting ? "alert-info" : "alert-warning"
                  } py-2 mb-3 small`}
                >
                  {isEditingExisting ? (
                    <>
                      <i className="bi bi-info-circle-fill me-1" />
                      Current PMC for <strong>{selectedMess.name}</strong> is{" "}
                      <strong>
                        {selectedMess.pmc?.rank} {selectedMess.pmc?.name}
                      </strong>
                      . Update the details below to save changes.
                    </>
                  ) : (
                    <>
                      <i className="bi bi-exclamation-circle-fill me-1" />
                      <strong>{selectedMess.name}</strong> has no PMC assigned.
                      Fill in the details below to create and link a PMC.
                    </>
                  )}
                </div>
              )}

              <div className="row">
                <div className="col-md-6">
                  <Field
                    label="Service Number"
                    value={pf.serviceId}
                    required
                    placeholder="e.g., 39343K"
                    disabled={!selectedMessId}
                    onChange={(v) => setPf({ ...pf, serviceId: v })}
                  />
                </div>
                <div className="col-md-6">
                  <Field
                    label="Rank"
                    value={pf.rank}
                    required
                    placeholder="e.g., Air Cmde/ Wg Cdr"
                    disabled={!selectedMessId}
                    onChange={(v) => setPf({ ...pf, rank: v })}
                  />
                </div>
              </div>

              <div className="row">
                <div className="col-md-6">
                  <Field
                    label="Officer Name"
                    value={pf.name}
                    required
                    placeholder="Full Name"
                    disabled={!selectedMessId}
                    onChange={(v) => setPf({ ...pf, name: v })}
                  />
                </div>
                <div className="col-md-6">
                  <Field
                    label="Mobile Number"
                    value={pf.mobile}
                    placeholder="10-digit mobile"
                    disabled={!selectedMessId}
                    onChange={(v) => setPf({ ...pf, mobile: v })}
                  />
                </div>
              </div>

              <Field
                label="Email / Login ID"
                type="email"
                value={pf.email}
                required
                placeholder="officer@email.com"
                disabled={!selectedMessId}
                onChange={(v) => setPf({ ...pf, email: v })}
              />

              <Field
                label="Password"
                type="password"
                value={pf.password}
                placeholder={
                  isEditingExisting
                    ? "Leave blank to keep existing password"
                    : "Leave blank for default Welcome@123"
                }
                disabled={!selectedMessId}
                onChange={(v) => setPf({ ...pf, password: v })}
              />

              <div className="d-flex gap-2 mt-3">
                <button
                  type="submit"
                  className="btn btn-dark flex-grow-1"
                  disabled={loading || !selectedMessId}
                >
                  <i
                    className={`bi ${
                      isEditingExisting ? "bi-check2-circle" : "bi-link-45deg"
                    } me-2`}
                  />
                  {loading
                    ? "Saving…"
                    : isEditingExisting
                      ? "Update PMC Details"
                      : "Link PMC to Mess"}
                </button>
                {selectedMessId && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => handleMessSelect("")}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </Card>
        </div>

        {/* SUMMARY CARD */}
        <div className="col-lg-6">
          <Card>
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-shield-check fs-4 text-success" />
              <div>
                <h5 className="mb-0">PMC Assignment Overview</h5>
                <small className="text-secondary">
                  High-level summary of mess PMC readiness.
                </small>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-6">
                <div className="border rounded p-3 text-center bg-light">
                  <div className="display-6 fw-bold text-primary">
                    {messes.length}
                  </div>
                  <small className="text-secondary text-uppercase fw-semibold">
                    Total Messes
                  </small>
                </div>
              </div>
              <div className="col-6">
                <div className="border rounded p-3 text-center bg-light">
                  <div className="display-6 fw-bold text-success">
                    {messes.filter((m) => m.pmc).length}
                  </div>
                  <small className="text-secondary text-uppercase fw-semibold">
                    PMC Assigned
                  </small>
                </div>
              </div>
            </div>

            <div className="alert alert-light border small text-secondary mb-0">
              <div className="fw-semibold text-dark mb-1">
                <i className="bi bi-lightbulb me-1 text-warning" />
                PMC Role Responsibilities:
              </div>
              <ul className="mb-0 ps-3">
                <li>Appoints and manages the Mess Manager and Mess Secretary.</li>
                <li>Monitors accommodation revenue, bills, and monthly occupancy.</li>
                <li>Has full administrative oversight over mess bookings.</li>
              </ul>
            </div>
          </Card>
        </div>
      </div>

      {/* PMC DIRECTORY TABLE */}
      <Card className="mt-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <h5 className="mb-0">Officers Mess & PMC Directory</h5>
            <small className="text-secondary">
              All registered messes with their linked PMC officer.
            </small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              onClick={load}
              disabled={loading}
              title="Refresh mess & PMC directory"
            >
              <i className={`bi bi-arrow-clockwise me-1 ${loading ? "spin" : ""}`} />
              Refresh
            </button>
            <span className="badge text-bg-dark">
              {filteredMesses.length} of {messes.length} Messes
            </span>
          </div>
        </div>

        {/* SEARCH & SORT BAR */}
        <div className="row g-2 mb-3">
          <div className="col-md-7 col-lg-8">
            <div className="input-group">
              <span className="input-group-text bg-white">
                <i className="bi bi-search text-secondary" />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search by mess name, station, PMC name, service no, email…"
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
          <div className="col-md-5 col-lg-4">
            <select
              className="form-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="NAME_ASC">Sort: Mess Name (A to Z)</option>
              <option value="NAME_DESC">Sort: Mess Name (Z to A)</option>
              <option value="PMC_NAME_ASC">Sort: PMC Name (A to Z)</option>
              <option value="STATUS_ASSIGNED">PMC Assigned First</option>
              <option value="STATUS_UNASSIGNED">No PMC First</option>
            </select>
          </div>
        </div>

        {loading && !filteredMesses.length ? (
          <TableLoading loading={true} />
        ) : !filteredMesses.length ? (
          <Empty text="No messes match your search criteria." />
        ) : (
          <TableLoading loading={loading}>
            <table className="table align-middle table-hover">
              <thead className="table-light">
                <tr>
                  <th>Officers Mess</th>
                  <th>Location</th>
                  <th>PMC Officer</th>
                  <th>Rank & Service No.</th>
                  <th>Email / Mobile</th>
                  <th>Created On</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMesses.map((m) => {
                  const isSelected = String(m._id) === String(selectedMessId);
                  return (
                    <tr
                      key={String(m._id)}
                      className={isSelected ? "table-primary" : ""}
                    >
                      <td>
                        <strong>{m.name}</strong>
                        <div className="small text-secondary">
                          {m.address || "—"}
                        </div>
                      </td>
                      <td>{m.city || m.location || "—"}</td>
                      <td>
                        {m.pmc ? (
                          <span className="fw-semibold text-dark">
                            {m.pmc.name}
                          </span>
                        ) : (
                          <span className="text-secondary italic">
                            Not assigned
                          </span>
                        )}
                      </td>
                      <td>
                        {m.pmc ? (
                          <>
                            <div>{m.pmc.rank || "—"}</div>
                            <small className="text-secondary">
                              {m.pmc.serviceId || "—"}
                            </small>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {m.pmc ? (
                          <>
                            <div className="small">{m.pmc.email || "—"}</div>
                            <small className="text-secondary">
                              {m.pmc.mobile || "—"}
                            </small>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-nowrap small text-secondary">
                        {fmtDate(m.createdAt) || "—"}
                      </td>
                      <td>
                        {m.pmc ? (
                          <Badge type="success">LINKED</Badge>
                        ) : (
                          <Badge type="warning">PENDING PMC</Badge>
                        )}
                      </td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => {
                            handleMessSelect(String(m._id));
                            document
                              .getElementById("pmc-form-panel")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                          }}
                        >
                          <i className="bi bi-pencil-square me-1" />
                          {m.pmc ? "Edit PMC" : "Assign PMC"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableLoading>
        )}

        {/* PAGINATION (20 per page) */}
        {totalPages > 1 && (
          <div className="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-3 border-top">
            <small className="text-secondary">
              Showing {startIndex + 1} –{" "}
              {Math.min(startIndex + PAGE_SIZE, filteredMesses.length)} of{" "}
              {filteredMesses.length} messes
            </small>
            <nav aria-label="PMC Table Pagination">
              <ul className="pagination pagination-sm mb-0">
                <li className={`page-item ${safePage === 1 ? "disabled" : ""}`}>
                  <button
                    className="page-link"
                    type="button"
                    disabled={safePage === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                </li>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <li
                    key={p}
                    className={`page-item ${p === safePage ? "active" : ""}`}
                  >
                    <button
                      className="page-link"
                      type="button"
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </button>
                  </li>
                ))}
                <li
                  className={`page-item ${
                    safePage === totalPages ? "disabled" : ""
                  }`}
                >
                  <button
                    className="page-link"
                    type="button"
                    disabled={safePage === totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </Card>
    </Page>
  );
}
