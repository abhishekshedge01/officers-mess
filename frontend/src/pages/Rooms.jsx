import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { api, errorMessage } from "../services/api";

import { Page, Card, Alert, Field, Empty, TableLoading } from "../components/UI";

const RATE = {
  TD_OFFICER: 2800,
  OFFICER_LEAVE: 1000,
  OFFICER_GUEST: 1000,
  DEPENDANT_GUEST: 1000,
};

const MEAL_RATE = {
  BREAKFAST: 150,
  LUNCH: 250,
  DINNER: 250,
};

const blankRoom = () => ({
  roomNumber: "",
  roomType: "STANDARD",
  capacity: 1,

  rates: {
    ...RATE,
    CHILD: 0,
  },
  mealRates: {
    ...MEAL_RATE,
  },
});

export default function Rooms({ readOnly = false }) {
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(blankRoom());
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  // Table controls
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("NUMBER_ASC");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [loading, setLoading] = useState(false);

  /* =========================
       LOAD ROOMS
       ========================= */

  const load = async () => {
    try {
      setLoading(true);
      setErr("");

      const roomsRes = await api.get("/rooms");
      setRooms(roomsRes.data?.rooms || []);
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  /* =========================
       RESET FORM
       ========================= */

  const reset = () => {
    setEditing(null);

    setRoom(blankRoom());
  };

  /* =========================
       SAVE ROOM
       MANAGER ONLY
       ========================= */

  const save = async (event) => {
    event?.preventDefault();

    if (readOnly) {
      return;
    }

    setBusy(true);

    setErr("");
    setOk("");

    try {
      const payload = {
        roomNumber: String(room.roomNumber || "").trim(),

        roomType: String(room.roomType || "STANDARD")
          .trim()
          .toUpperCase(),

        capacity: Number(room.capacity),

        rates: Object.fromEntries(
          Object.entries(room.rates || {}).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),

        mealRates: Object.fromEntries(
          Object.entries(room.mealRates || {}).map(([key, value]) => [
            key,
            Number(value),
          ]),
        ),
      };

      if (!payload.roomNumber) {
        throw new Error("Room number is required");
      }

      if (!Number.isInteger(payload.capacity) || payload.capacity < 1) {
        throw new Error("Capacity must be at least 1");
      }

      if (editing) {
        await api.patch(`/rooms/${editing}`, payload);

        setOk(`Room ${payload.roomNumber} updated successfully.`);
      } else {
        await api.post("/rooms", payload);

        setOk(`Room ${payload.roomNumber} added successfully.`);
      }

      reset();

      await load();
    } catch (error) {
      setErr(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  /* =========================
       EDIT ROOM
       MANAGER ONLY
       ========================= */

  const editRoom = (item) => {
    if (readOnly) {
      return;
    }

    setErr("");
    setOk("");

    setEditing(String(item._id));

    setRoom({
      ...blankRoom(),

      ...item,

      rates: {
        ...blankRoom().rates,
        ...(item.rates || {}),
      },

      mealRates: {
        ...blankRoom().mealRates,
        ...(item.mealRates || {}),
      },
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  /* =========================
       FILTER & SORT ROOMS
       ========================= */

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    let res = rooms.filter((r) => {
      if (!q) return true;
      const num = String(r.roomNumber || "").toLowerCase();
      const type = String(r.roomType || "").toLowerCase();
      const status = String(r.status || "").toLowerCase();
      return num.includes(q) || type.includes(q) || status.includes(q);
    });

    res.sort((a, b) => {
      switch (sort) {
        case "NUMBER_ASC":
          return String(a.roomNumber || "").localeCompare(String(b.roomNumber || ""), undefined, { numeric: true });
        case "NUMBER_DESC":
          return String(b.roomNumber || "").localeCompare(String(a.roomNumber || ""), undefined, { numeric: true });
        case "CAPACITY_DESC":
          return Number(b.capacity || 0) - Number(a.capacity || 0);
        case "CAPACITY_ASC":
          return Number(a.capacity || 0) - Number(b.capacity || 0);
        case "TYPE_ASC":
          return String(a.roomType || "").localeCompare(String(b.roomType || ""));
        default:
          return 0;
      }
    });

    return res;
  }, [rooms, search, sort]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredRooms.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRooms = filteredRooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Page
      title="Rooms Management"

      subtitle={
        readOnly
          ? "View room inventory and room details."
          : "Add and update rooms independently from Manager Operations."
      }
    >
      {/* =========================
                ALERTS
                ========================= */}

      {err && <Alert>{err}</Alert>}

      {ok && <Alert type="success">{ok}</Alert>}

      <div className="row g-3">
        {/* ==================================================
                    ADD / UPDATE ROOM
                    MANAGER ONLY
                    ================================================== */}

        {!readOnly && (
          <div className="col-xl-5">
            <Card>
              <div className="section-kicker">ROOM ADMINISTRATION</div>

              <h5 className="mb-3">
                {editing ? "Update room" : "Add new room"}
              </h5>

              <form onSubmit={save}>
                {/* ROOM NUMBER */}

                <Field
                  label="Room number"

                  value={room.roomNumber}

                  required

                  onChange={(value) =>
                    setRoom({
                      ...room,

                      roomNumber: value,
                    })
                  }
                />

                {/* ROOM TYPE */}

                <Field
                  label="Room type"

                  value={room.roomType}

                  onChange={(value) =>
                    setRoom({
                      ...room,

                      roomType: value,
                    })
                  }
                />

                {/* CAPACITY */}

                <Field
                  label="Capacity"

                  type="number"

                  value={room.capacity}

                  onChange={(value) =>
                    setRoom({
                      ...room,

                      capacity: value,
                    })
                  }
                />

                {/* =========================
                                    ROOM RATES
                                    ========================= */}

                {[
                  ["TD_OFFICER", "TD Officer"],

                  ["OFFICER_LEAVE", "Officer on Leave"],

                  ["OFFICER_GUEST", "Officer Guest"],

                  ["DEPENDANT_GUEST", "Dependant Guest"],
                ].map(([key, label]) => (
                  <Field
                    key={key}

                    label={`${label} rate / day`}

                    type="number"

                    value={room.rates?.[key] ?? RATE[key]}

                    onChange={(value) =>
                      setRoom({
                        ...room,

                        rates: {
                          ...room.rates,

                          [key]: value,
                        },
                      })
                    }
                  />
                ))}

                {/* =========================
                    MESSING / MEAL RATES
                    ========================= */}
                <div className="border-top pt-3 mt-3">
                  <div className="small fw-semibold text-uppercase text-secondary mb-2">
                    Messing Rates (₹ per meal)
                  </div>
                  {[
                    ["BREAKFAST", "Breakfast"],
                    ["LUNCH", "Lunch"],
                    ["DINNER", "Dinner"],
                  ].map(([key, label]) => (
                    <Field
                      key={key}
                      label={`${label} charge`}
                      type="number"
                      value={room.mealRates?.[key] ?? MEAL_RATE[key]}
                      onChange={(value) =>
                        setRoom({
                          ...room,
                          mealRates: {
                            ...room.mealRates,
                            [key]: value,
                          },
                        })
                      }
                    />
                  ))}
                </div>

                {/* BUTTONS */}

                <div className="d-flex gap-2 mt-3">
                  <button
                    type="submit"

                    className="btn btn-dark"

                    disabled={busy}
                  >
                    <i className="bi bi-check2-circle me-2" />

                    {busy ? "Saving..." : editing ? "Update room" : "Add room"}
                  </button>

                  {editing && (
                    <button
                      type="button"

                      className="btn btn-outline-secondary"

                      onClick={reset}

                      disabled={busy}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ==================================================
                    EXISTING ROOMS
                    ================================================== */}

        <div className={readOnly ? "col-12" : "col-xl-7"}>
          <Card>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <div className="section-kicker">ROOM INVENTORY</div>

                <h5 className="mb-1">Existing rooms</h5>

                <small className="text-secondary">
                  {readOnly
                    ? "View-only room information. Room changes can be made by the Mess Manager."
                    : "Rooms added here are independently managed and used for guest allocation."}
                </small>
              </div>

              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-dark"
                  onClick={load}
                  disabled={loading}
                  title="Refresh rooms"
                >
                  <i className={`bi bi-arrow-clockwise me-1 ${loading ? "spin" : ""}`} />
                  Refresh
                </button>
                <span className="badge text-bg-dark">
                  {rooms.length} room
                  {rooms.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Search & Sort controls */}
            <div className="row g-2 mb-3">
              <div className="col-md-7">
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-search" />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search by room number, type..."
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
              <div className="col-md-5">
                <select
                  className="form-select"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="NUMBER_ASC">Room Number ↑</option>
                  <option value="NUMBER_DESC">Room Number ↓</option>
                  <option value="CAPACITY_DESC">Capacity (High → Low)</option>
                  <option value="CAPACITY_ASC">Capacity (Low → High)</option>
                  <option value="TYPE_ASC">Room Type (A → Z)</option>
                </select>
              </div>
            </div>

            {/* =========================
                            NO ROOMS
                            ========================= */}

            {loading && !filteredRooms.length ? (
              <TableLoading loading={true} />
            ) : !filteredRooms.length ? (
              <Empty text={search ? "No rooms match your search." : "No rooms have been added yet."} />
            ) : (
              <TableLoading loading={loading}>
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th>Room</th>

                      <th>Type</th>

                      <th>Capacity</th>

                      <th>Status</th>

                      <th>Room Rates / day</th>

                      <th>Meal Rates</th>

                      {!readOnly && <th></th>}
                    </tr>
                  </thead>

                  <tbody>
                    {paginatedRooms.map((item) => (
                      <tr key={String(item._id)}>
                        {/* ROOM */}

                        <td>
                          <strong>{item.roomNumber}</strong>
                        </td>

                        {/* TYPE */}

                        <td>{item.roomType || "STANDARD"}</td>

                        {/* CAPACITY */}

                        <td>{item.capacity}</td>

                        {/* STATUS */}

                        <td>
                          <span
                            className={
                              item.status === "ACTIVE"
                                ? "badge text-bg-success"
                                : "badge text-bg-secondary"
                            }
                          >
                            {item.status || "ACTIVE"}
                          </span>
                        </td>

                        {/* RATES */}

                        <td>
                          <small>
                            TD ₹{item.rates?.TD_OFFICER ?? RATE.TD_OFFICER}
                            <br />
                            Leave ₹
                            {item.rates?.OFFICER_LEAVE ?? RATE.OFFICER_LEAVE}
                            <br />
                            Guest ₹
                            {item.rates?.OFFICER_GUEST ?? RATE.OFFICER_GUEST}
                            <br />
                            Dependant ₹
                            {item.rates?.DEPENDANT_GUEST ??
                              RATE.DEPENDANT_GUEST}
                          </small>
                        </td>

                        {/* MEAL RATES */}
                        <td>
                          <small className="text-muted">
                            Breakfast: ₹{item.mealRates?.BREAKFAST ?? MEAL_RATE.BREAKFAST}
                            <br />
                            Lunch: ₹{item.mealRates?.LUNCH ?? MEAL_RATE.LUNCH}
                            <br />
                            Dinner: ₹{item.mealRates?.DINNER ?? MEAL_RATE.DINNER}
                          </small>
                        </td>

                        {/* EDIT
                                                        MANAGER ONLY */}

                        {!readOnly && (
                          <td className="text-end">
                            <button
                              type="button"

                              className="btn btn-sm btn-outline-dark"

                              onClick={() => editRoom(item)}
                            >
                              <i className="bi bi-pencil me-1" />
                              Edit
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableLoading>
            )}

            {totalPages > 1 && (
              <div className="d-flex justify-content-between align-items-center mt-3 pt-3 border-top">
                <small className="text-secondary">
                  Showing {(safePage - 1) * PAGE_SIZE + 1} to{" "}
                  {Math.min(safePage * PAGE_SIZE, filteredRooms.length)} of{" "}
                  {filteredRooms.length} rooms
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
        </div>
      </div>
    </Page>
  );
}
