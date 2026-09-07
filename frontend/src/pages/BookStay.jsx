import React, { useEffect, useMemo, useState } from "react";

import { useNavigate, Link } from "react-router-dom";

import { api, errorMessage, auth } from "../services/api";

import {
  CATEGORIES,
  categoryName,
  fmtDate,
  dateOnly,
  localDate,
} from "../constants";

import {
  Page,
  Card,
  Field,
  Autocomplete,
  Alert,
  Badge,
} from "../components/UI";

import { CityAutocomplete } from "../components/Autocomplete";

const RELATIONS = [
  ["SELF", "Self"],
  ["WIFE", "Wife of"],
  ["HUSBAND", "Husband of"],
  ["MOTHER", "Mother of"],
  ["FATHER", "Father of"],
  ["SON", "Son of"],
  ["DAUGHTER", "Daughter of"],
  ["BROTHER", "Brother of"],
  ["SISTER", "Sister of"],
  ["DEPENDANT", "Dependant of"],
  ["GUEST", "Guest of"],
  ["OTHER", "Other"],
];

const TYPES = [
  ["SERVING_OFFICER", "Serving Officer"],
  ["RETIRED_OFFICER", "Retired Officer"],
  ["DEPENDANT", "Dependant"],
  ["GUEST", "Guest"],
];

const RATE = {
  TD_OFFICER: 2800,
  OFFICER_LEAVE: 1000,
  OFFICER_GUEST: 1000,
  DEPENDANT_GUEST: 1000,
};

const emptyMember = () => ({
  name: "",
  age: "",
  memberType: "GUEST",
  serviceId: "",
  relation: "",
  mobile: "",
  isChild: false,
});

const cityName = (value) =>
  String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();

const sameCity = (first, second) => cityName(first) === cityName(second);

/*
|--------------------------------------------------------------------------
| DISPLAY DATE
|--------------------------------------------------------------------------
|
| The backend gives:
| 2026-09-03
|
| We display:
| 03 Sep 2026
|--------------------------------------------------------------------------
*/

const displayDate = (value) => fmtDate(value);

export default function BookStay() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [messes, setMesses] = useState([]);

  const [city, setCity] = useState("");

  const [form, setForm] = useState({
    messId: "",
    checkInDate: "",
    checkOutDate: "",
    stayCategory: "TD_OFFICER",
    travellingWithKid: false,
    purpose: "",
  });

  const [members, setMembers] = useState([
    {
      ...emptyMember(),

      name: auth.user?.name || "",

      memberType: "SERVING_OFFICER",

      serviceId: auth.user?.serviceId || "",

      mobile: auth.user?.mobile || "",

      relation: "SELF",
    },
  ]);

  const [availability, setAvailability] = useState(null);

  const [error, setError] = useState("");

  const [success, setSuccess] = useState("");

  const [busy, setBusy] = useState(false);
  const [pendingBookings, setPendingBookings] = useState([]);

  /*
   * Load Messes and user's pending stay requests waiting for approval.
   */
  useEffect(() => {
    api
      .get("/messes")
      .then((response) => {
        setMesses(response.data.messes || []);
      })
      .catch((err) => {
        setError(errorMessage(err));
      });

    api
      .get("/bookings/my")
      .then((response) => {
        const myStays = response.data?.bookings || [];
        const pending = myStays.filter(
          (b) =>
            b.status === "PENDING_MANAGER" ||
            b.status === "PENDING_SECRETARY" ||
            b.status === "PENDING_PMC",
        );
        setPendingBookings(pending);
      })
      .catch((err) => {
        console.error("Unable to load pending stays:", err);
      });
  }, []);

  /*
   * Mess options filtered
   * by city.
   */
  const messOptions = useMemo(
    () =>
      messes
        .filter((mess) => !city || sameCity(mess.city, city))
        .map((mess) => ({
          value: String(mess._id || mess.id),

          label: mess.name,

          meta: [mess.city, mess.location || mess.address]
            .filter(Boolean)
            .join(" · "),
        })),
    [messes, city],
  );

  const selectedMess = messes.find(
    (mess) => String(mess._id || mess.id) === String(form.messId),
  );

  /*
   * Update member.
   */
  const updateMember = (index, key, value) => {
    setMembers((current) =>
      current.map((member, memberIndex) =>
        memberIndex === index
          ? {
              ...member,
              [key]: value,
            }
          : member,
      ),
    );
  };

  /*
   * Select Mess.
   */
  const chooseMess = (id) => {
    setForm({
      ...form,
      messId: id,
    });

    setAvailability(null);
    setError("");
  };

  /*
   * Continue to stay details.
   */
  const continueToDetails = () => {
    setError("");

    if (!city) {
      return setError("Please select a city first.");
    }

    if (!form.messId) {
      return setError("Please select an Officers Mess.");
    }

    setStep(2);
  };

  const today = localDate();

  const minCheckOutDate = useMemo(() => {
    if (!form.checkInDate) return "";
    const [y, m, d] = form.checkInDate.split("-").map(Number);
    if (!y || !m || !d) return "";
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }, [form.checkInDate]);

  /*
   * Check availability.
   */
  const checkAvailability = async () => {
    setError("");
    setSuccess("");
    setAvailability(null);

    if (!form.messId || !form.checkInDate || !form.checkOutDate) {
      return setError("Select a Mess, check-in date and check-out date.");
    }

    if (form.checkInDate < today) {
      return setError("Check-in date cannot be in the past.");
    }

    if (form.checkOutDate <= form.checkInDate) {
      return setError("Check-out date must be after check-in date.");
    }

    try {
      const response = await api.get("/rooms/available", {
        params: form,
      });

      setAvailability(response.data);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  /*
   * Submit booking.
   *
   * IMPORTANT:
   * Partial availability can NEVER
   * be submitted.
   */
  const submitBooking = async () => {
    setError("");

    if (!availability?.fullyAvailable) {
      return setError(
        "The complete requested stay is not available. Please choose different dates.",
      );
    }

    if (members.some((member) => !member.name.trim() || !member.relation)) {
      return setError("Every staying member needs a name and relation.");
    }

    setBusy(true);

    try {
      await api.post("/bookings", {
        ...form,

        city,

        stayMembers: members.map((member, index) => ({
          ...member,

          age: Number(member.age) || 0,

          isBooker: index === 0,
        })),
      });

      setSuccess("Stay request submitted to the Mess Manager.");

      setTimeout(() => navigate("/my-bookings"), 700);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  /*
   * Add member.
   */
  const addMember = () => {
    setMembers((current) => [...current, emptyMember()]);
  };

  /*
   * Remove member.
   */
  const removeMember = (index) => {
    setMembers((current) =>
      current.filter((_, memberIndex) => memberIndex !== index),
    );
  };

  /*
   * Partial availability.
   */
  const partial = availability?.partialAvailability;

  return (
    <Page
      title="Request accommodation"
      subtitle={
        step === 1
          ? "Start by choosing the city and Officers Mess."
          : "Now enter your stay dates and the members staying with you."
      }
    >
      {error && <Alert>{error}</Alert>}

      {success && <Alert type="success">{success}</Alert>}

      {/* PENDING APPROVAL QUEUE COUNTER BANNER */}
      {pendingBookings.length > 0 && (
        <div className="alert alert-warning d-flex justify-content-between align-items-center mb-4 shadow-sm">
          <div>
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-hourglass-split fs-5 text-warning-emphasis"></i>
              <strong>
                You have {pendingBookings.length} booking request
                {pendingBookings.length === 1 ? "" : "s"} waiting for approval
              </strong>
            </div>
            <small className="text-secondary d-block mt-1">
              Currently awaiting review and room allotment by the Mess Manager.
            </small>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="badge bg-warning text-dark px-2 py-1 fs-6">
              {pendingBookings.length} in queue
            </span>
            <Link to="/my-bookings" className="btn btn-sm btn-outline-dark">
              View Stays
            </Link>
          </div>
        </div>
      )}

      {/* STEP INDICATOR */}
      <div className="booking-stepper mb-4">
        <div className={step === 1 ? "active" : ""}>
          <span>1</span>

          <div>
            <b>Choose Mess</b>

            <small>City & Officers Mess</small>
          </div>
        </div>

        <div className={step === 2 ? "active" : ""}>
          <span>2</span>

          <div>
            <b>Stay details</b>

            <small>Dates & members</small>
          </div>
        </div>
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <Card className="mess-selection-card">
          <div className="section-kicker">
            <h5>STEP 1 · CHOOSE YOUR MESS</h5>
          </div>

          <h4 className="mb-1">Where would you like to stay?</h4>

          <p className="text-secondary mb-4">
            Select your city first, then choose the Officers Mess.
          </p>

          <div className="row justify-content">
            <div className="col-lg-8">
              <CityAutocomplete
                value={city}
                onChange={(value) => {
                  setCity(value);

                  setForm({
                    ...form,
                    messId: "",
                  });

                  setAvailability(null);
                }}
                required
                placeholder="Search city e.g. Aizawl, Guwahati, Pune…"
              />

              <Autocomplete
                label="Officers Mess"
                value={form.messId}
                onChange={chooseMess}
                options={messOptions}
                required
                placeholder={
                  city
                    ? "Search Officers Mess in this city…"
                    : "Select a city first…"
                }
                disabled={!city}
                helper={
                  city
                    ? `${messOptions.length} Mess${
                        messOptions.length === 1 ? "" : "es"
                      } found in ${city}.`
                    : ""
                }
              />
              {selectedMess && (
                <button
                  type="button"
                  className="selected-mess selected-mess-clickable w-100 text-start"
                  onClick={continueToDetails}
                >
                  <div className="selected-mess-icon">
                    <i className="bi bi-building-check" />
                  </div>

                  <div className="flex-grow-1">
                    <strong>{selectedMess.name}</strong>

                    <small>
                      {[
                        selectedMess.address,
                        selectedMess.city,
                        selectedMess.location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>

                  <span className="btn btn-dark btn-sm">
                    Continue
                    <i className="bi bi-arrow-right ms-1" />
                  </span>
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          <div className="mb-3">
            <button
              className="btn btn-outline-dark btn-sm"
              onClick={() => {
                setStep(1);

                setError("");

                setAvailability(null);
              }}
            >
              <i className="bi bi-arrow-left me-1" />
              Change Mess
            </button>

            <span className="ms-3 text-secondary">
              {selectedMess?.name} · {city}
            </span>
          </div>

          <div className="row g-4 align-items-start">
            {/* STAY DETAILS */}
            <div className="col-xl-5">
              <Card>
                <div className="section-kicker">STAY DETAILS</div>

                <h5 className="mb-3">{selectedMess?.name}</h5>

                <div className="selected-mess mb-3">
                  <div className="selected-mess-icon">
                    <i className="bi bi-building" />
                  </div>

                  <div>
                    <strong>{city}</strong>

                    <small>
                      {[selectedMess?.address, selectedMess?.location]
                        .filter(Boolean)
                        .join(" · ") || "Officers Mess"}
                    </small>
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6">
                    <Field
                      label="Check-in"
                      type="date"
                      value={form.checkInDate}
                      min={today}
                      onChange={(value) => {
                        const newCheckIn = value;
                        let newCheckOut = form.checkOutDate;
                        // If selected checkout date is less than or same as check-in, clear or advance it
                        if (newCheckOut && newCheckOut <= newCheckIn) {
                          newCheckOut = "";
                        }
                        setForm({
                          ...form,
                          checkInDate: newCheckIn,
                          checkOutDate: newCheckOut,
                        });

                        setAvailability(null);
                      }}
                      required
                    />
                  </div>

                  <div className="col-md-6">
                    <Field
                      label="Check-out"
                      type="date"
                      value={form.checkOutDate}
                      min={minCheckOutDate}
                      disabled={!form.checkInDate}
                      onChange={(value) => {
                        setForm({
                          ...form,
                          checkOutDate: value,
                        });

                        setAvailability(null);
                      }}
                      required
                    />
                  </div>
                </div>

                <Autocomplete
                  label="Accommodation category"
                  value={form.stayCategory}
                  onChange={(value) => {
                    setForm({
                      ...form,
                      stayCategory: value,
                    });

                    setAvailability(null);
                  }}
                  options={CATEGORIES.map(([value, label]) => ({
                    value,
                    label,
                    meta: `₹${(RATE[value] || 0).toLocaleString(
                      "en-IN",
                    )} / day`,
                  }))}
                  required
                  placeholder="Search category…"
                />

                <div className="tariff-note">
                  <i className="bi bi-shield-check" />

                  <span>
                    <strong>Tariff:</strong> {categoryName(form.stayCategory)} ·
                    ₹{(RATE[form.stayCategory] || 0).toLocaleString("en-IN")}{" "}
                    per chargeable day.
                  </span>
                </div>

                <div className="form-check mb-3">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={form.travellingWithKid}
                    onChange={(event) => {
                      setForm({
                        ...form,
                        travellingWithKid: event.target.checked,
                      });

                      setAvailability(null);
                    }}
                  />

                  <label className="form-check-label">
                    Travelling with a child
                  </label>
                </div>

                <Field
                  label="Purpose / remarks"
                  value={form.purpose}
                  onChange={(value) =>
                    setForm({
                      ...form,
                      purpose: value,
                    })
                  }
                  placeholder="Optional"
                />

                <button
                  className="btn btn-outline-dark w-100"
                  onClick={checkAvailability}
                >
                  <i className="bi bi-search me-2" />
                  Check availability
                </button>

                {/* AVAILABILITY */}
                {availability && (
                  <div className="availability-card p-3 mt-3">
                    {/* FULLY AVAILABLE */}
                    {availability.fullyAvailable ? (
                      <>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="section-kicker">AVAILABILITY</div>

                            <strong>Complete stay available</strong>

                            <small className="text-secondary d-block mt-1">
                              A suitable room is available for your entire
                              requested stay.
                            </small>
                          </div>

                          <span className="status-pill status-good">
                            AVAILABLE
                          </span>
                        </div>

                        <div className="availability-summary mt-3">
                          <div>
                            <span>Requested nights</span>

                            <strong>{availability.nights}</strong>
                          </div>

                          <div>
                            <span>Rooms available</span>

                            <strong>
                              {
                                (availability.rooms || []).filter(
                                  (room) => room.availableForEntireStay,
                                ).length
                              }
                            </strong>
                          </div>

                          <div>
                            <span>Rooms total</span>

                            <strong>{(availability.rooms || []).length}</strong>
                          </div>
                        </div>
                      </>
                    ) : partial ? (
                      /* PARTIALLY AVAILABLE */
                      <>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="section-kicker">AVAILABILITY</div>

                            <strong>Partially available</strong>

                            <small className="text-secondary d-block mt-1">
                              The Mess has rooms available for part of your
                              requested stay.
                            </small>
                          </div>

                          <span className="status-pill status-warning">
                            PARTIAL
                          </span>
                        </div>

                        <div className="mt-3 p-3 rounded border">
                          <div className="small text-secondary">
                            Available from
                          </div>

                          <div className="fw-semibold fs-5">
                            {displayDate(partial.checkInDate)} →{" "}
                            {displayDate(partial.checkOutDate)}
                          </div>

                          <div className="mt-2">
                            <span className="text-secondary">
                              Available for
                            </span>{" "}
                            <strong>{partial.nights} nights</strong>
                          </div>
                        </div>

                        <div className="mt-3 small">
                          <div>
                            <span className="text-secondary">Requested:</span>{" "}
                            <strong>
                              {displayDate(form.checkInDate)} –{" "}
                              {displayDate(form.checkOutDate)}
                            </strong>
                          </div>

                          <div className="mt-1">
                            <span className="text-secondary">Available:</span>{" "}
                            <strong>
                              {displayDate(partial.checkInDate)} –{" "}
                              {displayDate(partial.checkOutDate)}
                            </strong>
                          </div>
                        </div>

                        <div className="alert alert-warning mt-3 mb-0">
                          <i className="bi bi-exclamation-triangle me-2" />
                          Complete requested stay is not available. Please
                          select different dates.
                        </div>
                      </>
                    ) : (
                      /* NOT AVAILABLE */
                      <>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="section-kicker">AVAILABILITY</div>

                            <strong>Stay not available</strong>

                            <small className="text-secondary d-block mt-1">
                              No suitable room is available for the requested
                              stay.
                            </small>
                          </div>

                          <span className="status-pill status-bad">
                            NOT AVAILABLE
                          </span>
                        </div>

                        <div className="availability-summary mt-3">
                          <div>
                            <span>Requested nights</span>

                            <strong>{availability.nights}</strong>
                          </div>

                          <div>
                            <span>Rooms available</span>

                            <strong>0</strong>
                          </div>

                          <div>
                            <span>Rooms total</span>

                            <strong>{(availability.rooms || []).length}</strong>
                          </div>
                        </div>
                      </>
                    )}

                    <small className="text-secondary d-block mt-3">
                      Room numbers are managed by the Mess and are not shown to
                      officers.
                    </small>
                  </div>
                )}
              </Card>
            </div>

            {/* MEMBERS */}
            <div className="col-xl-7">
              <Card>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <div className="section-kicker">STAYING MEMBERS</div>

                    <h5 className="mb-0">Who is staying?</h5>

                    <small className="text-secondary">
                      Add everyone who will stay in the Mess.
                    </small>
                  </div>

                  <button className="btn btn-sm btn-dark" onClick={addMember}>
                    <i className="bi bi-person-plus me-1" />
                    Add member
                  </button>
                </div>

                {members.map((member, index) => {
                  const simple =
                    member.memberType === "DEPENDANT" ||
                    member.memberType === "GUEST";

                  return (
                    <div className="member-card" key={index}>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <b>
                          {index === 0
                            ? "Booker / Member"
                            : `Member ${index + 1}`}
                        </b>

                        {index > 0 && (
                          <button
                            className="btn btn-sm btn-link text-danger"
                            onClick={() => removeMember(index)}
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="row">
                        <div className="col-md-6">
                          <Field
                            label="Name"
                            value={member.name}
                            onChange={(value) =>
                              updateMember(index, "name", value)
                            }
                            required
                          />
                        </div>

                        <div className="col-md-6">
                          <Autocomplete
                            label="Relation"
                            value={member.relation}
                            onChange={(value) =>
                              updateMember(index, "relation", value)
                            }
                            options={RELATIONS.map(([value, label]) => ({
                              value,
                              label,
                            }))}
                            required
                            placeholder="Search relation…"
                          />
                        </div>
                      </div>

                      <div className="row">
                        <div className="col-md-6">
                          <Autocomplete
                            label="Member type"
                            value={member.memberType}
                            onChange={(value) =>
                              updateMember(index, "memberType", value)
                            }
                            options={TYPES.map(([value, label]) => ({
                              value,
                              label,
                            }))}
                          />
                        </div>
                      </div>

                      {!simple && (
                        <div className="row">
                          <div className="col-md-7">
                            <Field
                              label="Mobile"
                              value={member.mobile}
                              onChange={(value) =>
                                updateMember(index, "mobile", value)
                              }
                            />
                          </div>

                          <div className="col-md-5 d-flex align-items-center">
                            <div className="form-check mt-2">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={member.isChild}
                                onChange={(event) =>
                                  updateMember(
                                    index,
                                    "isChild",
                                    event.target.checked,
                                  )
                                }
                              />

                              <label className="form-check-label">
                                This member is a child
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  className="btn btn-dark w-100 mt-2 py-2"
                  disabled={busy || !availability?.fullyAvailable}
                  onClick={submitBooking}
                >
                  {busy ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <i className="bi bi-send me-2" />
                      Submit stay request
                    </>
                  )}
                </button>

                <small className="text-secondary d-block text-center mt-2">
                  Your request goes directly to the Mess Manager for approval
                  and room allocation.
                </small>
              </Card>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
