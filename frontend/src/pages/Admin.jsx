import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../services/api";
import { Page, Card, Field, Alert, Badge, Empty, TableLoading } from "../components/UI";
import { CITIES } from "../components/Autocomplete";
import { fmtDate } from "../constants";

const blankMess = { name: "", location: "", city: "", address: "" };

export default function Admin() {
  const [messes, setMesses] = useState([]);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [mf, setMf] = useState(blankMess);
  const [customLocation, setCustomLocation] = useState("");
  const [isCustomLoc, setIsCustomLoc] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameSuggestionsOpen, setNameSuggestionsOpen] = useState(false);

  // Table controls: search, sort, pagination (20 entries)
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("NEWEST");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/messes");
      setMesses(r.data.messes || r.data || []);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Prepare list of only cities for dropdown
  const locationOptions = useMemo(() => {
    const set = new Set();
    // Only cities from predefined Indian cities list
    if (Array.isArray(CITIES)) {
      CITIES.forEach(([city]) => {
        if (city && typeof city === "string") {
          set.add(city.trim());
        }
      });
    }
    // Plus any city explicitly recorded from existing messes
    messes.forEach((m) => {
      if (m.city) set.add(m.city.trim());
      else if (m.location) set.add(m.location.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [messes]);

  // Active location string
  const activeLocation = isCustomLoc
    ? customLocation.trim()
    : mf.location.trim();

  // Existing messes in active location
  const existingMessesInLocation = useMemo(() => {
    if (!activeLocation) return [];
    const locLower = activeLocation.toLowerCase();
    return messes.filter(
      (m) =>
        (m.location || "").toLowerCase().trim() === locLower ||
        (m.city || "").toLowerCase().trim() === locLower,
    );
  }, [messes, activeLocation]);

  // Check if name already exists in chosen location
  const duplicateMess = useMemo(() => {
    if (!activeLocation || !mf.name.trim()) return null;
    const nameLower = mf.name.trim().toLowerCase();
    return (
      existingMessesInLocation.find(
        (m) => (m.name || "").trim().toLowerCase() === nameLower,
      ) || null
    );
  }, [existingMessesInLocation, mf.name, activeLocation]);

  // Autocomplete matching names in location or system
  const nameSuggestions = useMemo(() => {
    if (!mf.name.trim()) {
      return existingMessesInLocation.map((m) => m.name);
    }
    const q = mf.name.toLowerCase().trim();
    const pool = existingMessesInLocation.length
      ? existingMessesInLocation
      : messes;
    return Array.from(
      new Set(
        pool
          .map((m) => m.name)
          .filter((name) => name && name.toLowerCase().includes(q)),
      ),
    ).slice(0, 8);
  }, [existingMessesInLocation, messes, mf.name]);

  const handleLocationChange = (val) => {
    if (val === "__OTHER__") {
      setIsCustomLoc(true);
      setMf((prev) => ({ ...prev, location: "", city: "" }));
    } else {
      setIsCustomLoc(false);
      setCustomLocation("");
      setMf((prev) => ({ ...prev, location: val, city: val }));
    }
  };

  const createMess = async (e) => {
    e.preventDefault();
    setErr("");
    setOk("");

    const finalLocation = activeLocation;
    if (!finalLocation) {
      setErr("Please select or enter a Location / Station.");
      return;
    }

    if (duplicateMess) {
      setErr(
        `Officers Mess "${mf.name.trim()}" already exists in ${finalLocation}. Please enter a unique mess name.`,
      );
      return;
    }

    setLoading(true);
    try {
      await api.post("/admin/messes", {
        ...mf,
        name: mf.name.trim(),
        location: finalLocation,
        city: finalLocation,
        address: mf.address.trim(),
      });
      setMf(blankMess);
      setIsCustomLoc(false);
      setCustomLocation("");
      setSort("NEWEST");
      setPage(1);
      setOk("Officers Mess created successfully.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      await load();
    } catch (e) {
      setErr(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMess = async (mess) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${mess.name}"?\nThis action cannot be undone.`,
    );
    if (!confirmed) return;

    setErr("");
    setOk("");
    setLoading(true);
    try {
      await api.delete(`/admin/messes/${mess._id}`);
      setOk(`Officers Mess "${mess.name}" deleted successfully.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      await load();
    } catch (e) {
      setErr(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setLoading(false);
    }
  };

  // Search & sorting logic
  const filteredMesses = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = messes.filter((m) => {
      if (!q) return true;
      const name = String(m.name || "").toLowerCase();
      const loc = String(m.location || m.city || "").toLowerCase();
      const addr = String(m.address || "").toLowerCase();
      const pmc = String(m.pmc?.name || "").toLowerCase();
      return (
        name.includes(q) || loc.includes(q) || addr.includes(q) || pmc.includes(q)
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
        case "NEWEST":
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case "OLDEST":
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
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
  const paginatedMesses = filteredMesses.slice(
    startIndex,
    startIndex + PAGE_SIZE,
  );

  return (
    <Page
      title="Officers Messes"
      subtitle="Register and manage Officers Mess establishments across stations."
      actions={
        <Link className="btn btn-outline-dark" to="/admin/pmc">
          <i className="bi bi-person-badge me-2" />
          Assign / Manage PMCs
        </Link>
      }
    >
      {ok && <Alert type="success">{ok}</Alert>}
      {err && <Alert>{err}</Alert>}

      <div className="row g-4">
        {/* ADD MESS FORM */}
        <div className="col-lg-5">
          <Card>
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-building-add fs-4 text-primary" />
              <div>
                <h5 className="mb-0">Add Officers Mess</h5>
                <small className="text-secondary">
                  Select location first, then enter mess details.
                </small>
              </div>
            </div>

            <form onSubmit={createMess}>
              {/* STEP 1: LOCATION OUT OF DROPDOWN */}
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Location <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select"
                  value={isCustomLoc ? "__OTHER__" : mf.location}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  required
                >
                  <option value="">-- Select Location --</option>
                  {locationOptions.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="__OTHER__">+ Other / Enter Custom City</option>
                </select>

                {isCustomLoc && (
                  <div className="mt-2">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Type custom city / location…"
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      required
                    />
                  </div>
                )}
              </div>

              {/* STEP 2: MESS NAME WITH AUTOCOMPLETE & DUPLICATE CHECK */}
              <div className="mb-3 position-relative">
                <label className="form-label fw-semibold">
                  Officers Mess Name <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white">
                    <i className="bi bi-building" />
                  </span>
                  <input
                    type="text"
                    className={`form-control ${
                      duplicateMess ? "is-invalid border-danger" : ""
                    }`}
                    placeholder={
                      activeLocation
                        ? `e.g. ${activeLocation} Officers Mess`
                        : "Select location first…"
                    }
                    value={mf.name}
                    disabled={!activeLocation}
                    required
                    onFocus={() => setNameSuggestionsOpen(true)}
                    onChange={(e) => {
                      setMf({ ...mf, name: e.target.value });
                      setNameSuggestionsOpen(true);
                    }}
                  />
                  {mf.name && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setMf({ ...mf, name: "" })}
                    >
                      <i className="bi bi-x" />
                    </button>
                  )}
                </div>

                {/* DUPLICATE WARNING */}
                {duplicateMess && (
                  <div className="alert alert-danger py-2 px-3 mt-2 mb-0 small">
                    <i className="bi bi-exclamation-triangle-fill me-2" />
                    Officers Mess "<strong>{duplicateMess.name}</strong>" already
                    exists in {activeLocation}. Please choose a different name.
                  </div>
                )}

                {/* AUTOCOMPLETE SUGGESTIONS POPUP */}
                {nameSuggestionsOpen &&
                  !duplicateMess &&
                  nameSuggestions.length > 0 && (
                    <div
                      className="autocomplete-menu shadow-sm position-absolute w-100 bg-white border rounded mt-1"
                      style={{ zIndex: 1050, maxHeight: 180, overflowY: "auto" }}
                    >
                      <div className="px-3 py-1 bg-light border-bottom small text-secondary">
                        {existingMessesInLocation.length
                          ? `Existing messes in ${activeLocation}:`
                          : "Suggestions:"}
                      </div>
                      {nameSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="autocomplete-option dropdown-item text-start py-2 px-3 border-0 bg-transparent"
                          onClick={() => {
                            setMf({ ...mf, name: suggestion });
                            setNameSuggestionsOpen(false);
                          }}
                        >
                          <i className="bi bi-geo-alt me-2 text-secondary" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
              </div>

              {/* STEP 3: ADDRESS */}
              <Field
                label="Address"
                value={mf.address}
                required
                placeholder="Cantonment / Station address, PIN code…"
                disabled={!activeLocation}
                onChange={(v) => setMf({ ...mf, address: v })}
              />

              <button
                type="submit"
                className="btn btn-dark w-100 mt-2"
                disabled={
                  loading ||
                  !activeLocation ||
                  !mf.name.trim() ||
                  !mf.address.trim() ||
                  Boolean(duplicateMess)
                }
              >
                <i className="bi bi-plus-circle me-2" />
                {loading ? "Adding Mess…" : "Add Officers Mess"}
              </button>
            </form>
          </Card>
        </div>

        {/* MESS DIRECTORY SUMMARY */}
        <div className="col-lg-7">
          <Card>
            <div className="d-flex align-items-center gap-2 mb-3">
              <i className="bi bi-info-circle fs-4 text-primary" />
              <div>
                <h5 className="mb-0">Officers Mess Administration</h5>
                <small className="text-secondary">
                  Establishment guidelines and PMC linking procedure.
                </small>
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <div className="border rounded p-3 text-center bg-light">
                  <div className="display-6 fw-bold text-primary">
                    {messes.length}
                  </div>
                  <small className="text-secondary text-uppercase fw-semibold">
                    Total Messes
                  </small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="border rounded p-3 text-center bg-light">
                  <div className="display-6 fw-bold text-success">
                    {messes.filter((m) => m.pmc).length}
                  </div>
                  <small className="text-secondary text-uppercase fw-semibold">
                    PMC Linked
                  </small>
                </div>
              </div>
              <div className="col-md-4">
                <div className="border rounded p-3 text-center bg-light">
                  <div className="display-6 fw-bold text-warning">
                    {messes.filter((m) => !m.pmc).length}
                  </div>
                  <small className="text-secondary text-uppercase fw-semibold">
                    Needs PMC
                  </small>
                </div>
              </div>
            </div>

            <div className="alert alert-light border small text-secondary mb-0">
              <div className="fw-semibold text-dark mb-1">
                <i className="bi bi-diagram-3 me-1 text-primary" />
                Role & Workflow Separation:
              </div>
              <p className="mb-1">
                Officers Mess establishment is handled on this console. To link or
                update Presiding Officer Mess Committee (PMC) officers, use the
                dedicated <strong>PMC Management</strong> console from the sidebar.
              </p>
              <Link to="/admin/pmc" className="btn btn-sm btn-outline-dark mt-2">
                Open PMC Management →
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* MESSES DIRECTORY TABLE WITH SEARCH, SORT & PAGINATION (20 ENTRIES) */}
      <Card className="mt-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <div>
            <h5 className="mb-0">Officers Mess Directory</h5>
            <small className="text-secondary">
              All registered Officers Mess establishments across stations.
            </small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-dark"
              onClick={load}
              disabled={loading}
              title="Refresh mess directory"
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
              <span className="input-group-text bg-white text-secondary">
                <i className="bi bi-search" />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search by Mess name, station, city, address, PMC..."
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
              <option value="NAME_ASC">Mess Name (A to Z)</option>
              <option value="NAME_DESC">Mess Name (Z to A)</option>
              <option value="LOCATION_ASC">Location / Station</option>
              <option value="NEWEST">Newest First</option>
              <option value="OLDEST">Oldest First</option>
              <option value="PMC_LINKED">PMC Assigned First</option>
              <option value="PMC_PENDING">Needs PMC First</option>
            </select>
          </div>
        </div>

        {loading && !filteredMesses.length ? (
          <TableLoading loading={true} />
        ) : !filteredMesses.length ? (
          <Empty text="No Officers Mess matches your search." />
        ) : (
          <TableLoading loading={loading}>
            <table className="table align-middle table-hover">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Officers Mess</th>
                  <th>Location</th>
                  <th>Assigned PMC</th>
                  <th>PMC Contact</th>
                  <th>Created On</th>
                  <th>Status</th>
                  <th className="text-end">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedMesses.map((m, index) => (
                  <tr key={String(m._id)}>
                    <td className="text-secondary small">
                      {startIndex + index + 1}
                    </td>
                    <td>
                      <strong>{m.name}</strong>
                      <div className="small text-secondary">
                        {m.address || "—"}
                      </div>
                    </td>
                    <td>{m.city || m.location || "—"}</td>
                    <td>
                      {m.pmc ? (
                        <div>
                          <span className="fw-semibold text-dark">
                            {m.pmc.name}
                          </span>
                          <div className="small text-secondary">
                            {m.pmc.rank || "Officer"}{" "}
                            {m.pmc.serviceId ? `· ${m.pmc.serviceId}` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-secondary fst-italic">
                          Not assigned
                        </span>
                      )}
                    </td>
                    <td>
                      {m.pmc ? (
                        <div className="small">
                          <div>{m.pmc.email || "—"}</div>
                          <div className="text-secondary">
                            {m.pmc.mobile || "—"}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-nowrap small text-secondary">
                      {fmtDate(m.createdAt) || "—"}
                    </td>
                    <td>
                      {m.pmc ? (
                        <Badge type="success">ACTIVE & PMC LINKED</Badge>
                      ) : (
                        <Badge type="warning">NEEDS PMC</Badge>
                      )}
                    </td>
                    <td className="text-end text-nowrap">
                      <Link
                        to={`/admin/pmc?messId=${m._id}`}
                        className="btn btn-sm btn-outline-dark me-2"
                        title="Manage PMC for this mess"
                      >
                        <i className="bi bi-person-badge me-1" />
                        {m.pmc ? "View PMC" : "Assign PMC"}
                      </Link>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        title="Delete this mess"
                        onClick={() => handleDeleteMess(m)}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableLoading>
        )}

        {/* PAGINATION CONTROLS (20 ENTRIES) */}
        {totalPages > 1 && (
          <div className="d-flex flex-wrap justify-content-between align-items-center mt-3 pt-3 border-top">
            <small className="text-secondary">
              Showing {startIndex + 1} –{" "}
              {Math.min(startIndex + PAGE_SIZE, filteredMesses.length)} of{" "}
              {filteredMesses.length} messes
            </small>
            <nav aria-label="Messes Pagination">
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
