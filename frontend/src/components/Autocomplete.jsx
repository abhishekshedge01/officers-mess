// components/Autocomplete.jsx
// Generic dropdown autocompletion input and specialized Indian city selector.

import React, { useEffect, useRef, useState } from "react";

/**
 * Reusable dropdown autocomplete component for selecting from a list of options or entering custom text.
 */
export function Autocomplete({
  label,
  value,
  onChange,
  options = [],
  placeholder = "Type to search…",
  required = false,
  disabled = false,
  helper = "",
  allowCustom = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    setQuery(selected?.label || (allowCustom ? value || "" : ""));
  }, [value, selected?.label, allowCustom]);

  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const filtered = options
    .filter((o) =>
      String(o.label || "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .slice(0, 12);

  return (
    <div className="mb-3 autocomplete-wrap" ref={ref}>
      <label className="form-label">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </label>
      <div className="input-group">
        <span className="input-group-text bg-white">
          <i className="bi bi-search" />
        </span>
        <input
          className="form-control"
          value={query}
          disabled={disabled}
          required={required && !value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (allowCustom) onChange(v);
            else if (!v) onChange("");
            setOpen(true);
          }}
        />
        {value && (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setQuery("");
              onChange("");
              setOpen(false);
            }}
          >
            <i className="bi bi-x" />
          </button>
        )}
      </div>
      {helper && <div className="form-text">{helper}</div>}
      {open && !disabled && filtered.length > 0 && (
        <div className="autocomplete-menu shadow-sm">
          {filtered.map((o) => (
            <button
              type="button"
              key={String(o.value)}
              className="autocomplete-option"
              onClick={() => {
                onChange(o.value);
                setQuery(o.label);
                setOpen(false);
              }}
            >
              <span>{o.label}</span>
              {o.meta && <small>{o.meta}</small>}
            </button>
          ))}
        </div>
      )}
      {open && !disabled && query && !filtered.length && (
        <div className="autocomplete-menu shadow-sm">
          <div className="autocomplete-empty">No matches found</div>
        </div>
      )}
    </div>
  );
}

// Predefined list of Indian cities and their corresponding states
export const CITIES = [
  ["Agartala", "Tripura"],
  ["Agra", "Uttar Pradesh"],
  ["Ahmedabad", "Gujarat"],
  ["Aizawl", "Mizoram"],
  ["Ajmer", "Rajasthan"],
  ["Alappuzha", "Kerala"],
  ["Aligarh", "Uttar Pradesh"],
  ["Allahabad", "Uttar Pradesh"],
  ["Amritsar", "Punjab"],
  ["Anantapur", "Andhra Pradesh"],
  ["Aurangabad", "Maharashtra"],
  ["Bareilly", "Uttar Pradesh"],
  ["Belagavi", "Karnataka"],
  ["Bengaluru", "Karnataka"],
  ["Berhampur", "Odisha"],
  ["Bettiah", "Bihar"],
  ["Bhopal", "Madhya Pradesh"],
  ["Bhubaneswar", "Odisha"],
  ["Bilaspur", "Chhattisgarh"],
  ["Bikaner", "Rajasthan"],
  ["Bokaro", "Jharkhand"],
  ["Chandigarh", "Chandigarh"],
  ["Chennai", "Tamil Nadu"],
  ["Coimbatore", "Tamil Nadu"],
  ["Cuttack", "Odisha"],
  ["Darbhanga", "Bihar"],
  ["Dehradun", "Uttarakhand"],
  ["Delhi", "Delhi"],
  ["Dhanbad", "Jharkhand"],
  ["Dibrugarh", "Assam"],
  ["Dimapur", "Nagaland"],
  ["Durg", "Chhattisgarh"],
  ["Durgapur", "West Bengal"],
  ["Ernakulam", "Kerala"],
  ["Faridabad", "Haryana"],
  ["Gandhinagar", "Gujarat"],
  ["Gangtok", "Sikkim"],
  ["Gaya", "Bihar"],
  ["Ghaziabad", "Uttar Pradesh"],
  ["Goa", "Goa"],
  ["Gorakhpur", "Uttar Pradesh"],
  ["Gurugram", "Haryana"],
  ["Guwahati", "Assam"],
  ["Gwalior", "Madhya Pradesh"],
  ["Haldia", "West Bengal"],
  ["Haridwar", "Uttarakhand"],
  ["Hisar", "Haryana"],
  ["Hoshiarpur", "Punjab"],
  ["Hyderabad", "Telangana"],
  ["Imphal", "Manipur"],
  ["Indore", "Madhya Pradesh"],
  ["Itanagar", "Arunachal Pradesh"],
  ["Jabalpur", "Madhya Pradesh"],
  ["Jaipur", "Rajasthan"],
  ["Jalandhar", "Punjab"],
  ["Jalgaon", "Maharashtra"],
  ["Jammu", "Jammu and Kashmir"],
  ["Jamnagar", "Gujarat"],
  ["Jamshedpur", "Jharkhand"],
  ["Jhansi", "Uttar Pradesh"],
  ["Jodhpur", "Rajasthan"],
  ["Kakinada", "Andhra Pradesh"],
  ["Kanpur", "Uttar Pradesh"],
  ["Kochi", "Kerala"],
  ["Kohima", "Nagaland"],
  ["Kolar", "Karnataka"],
  ["Kolhapur", "Maharashtra"],
  ["Kolkata", "West Bengal"],
  ["Kota", "Rajasthan"],
  ["Kottayam", "Kerala"],
  ["Kozhikode", "Kerala"],
  ["Kurnool", "Andhra Pradesh"],
  ["Latur", "Maharashtra"],
  ["Lucknow", "Uttar Pradesh"],
  ["Ludhiana", "Punjab"],
  ["Madurai", "Tamil Nadu"],
  ["Mangalore", "Karnataka"],
  ["Meerut", "Uttar Pradesh"],
  ["Moradabad", "Uttar Pradesh"],
  ["Mumbai", "Maharashtra"],
  ["Muzaffarpur", "Bihar"],
  ["Mysuru", "Karnataka"],
  ["Nagpur", "Maharashtra"],
  ["Nanded", "Maharashtra"],
  ["Nashik", "Maharashtra"],
  ["Navi Mumbai", "Maharashtra"],
  ["Noida", "Uttar Pradesh"],
  ["Panaji", "Goa"],
  ["Patiala", "Punjab"],
  ["Patna", "Bihar"],
  ["Pimpri-Chinchwad", "Maharashtra"],
  ["Pondicherry", "Puducherry"],
  ["Prayagraj", "Uttar Pradesh"],
  ["Pune", "Maharashtra"],
  ["Raipur", "Chhattisgarh"],
  ["Rajahmundry", "Andhra Pradesh"],
  ["Rajkot", "Gujarat"],
  ["Ranchi", "Jharkhand"],
  ["Rourkela", "Odisha"],
  ["Sagar", "Madhya Pradesh"],
  ["Salem", "Tamil Nadu"],
  ["Shillong", "Meghalaya"],
  ["Shimla", "Himachal Pradesh"],
  ["Siliguri", "West Bengal"],
  ["Silchar", "Assam"],
  ["Srinagar", "Jammu and Kashmir"],
  ["Surat", "Gujarat"],
  ["Thane", "Maharashtra"],
  ["Thiruvananthapuram", "Kerala"],
  ["Thrissur", "Kerala"],
  ["Tiruchirappalli", "Tamil Nadu"],
  ["Tirunelveli", "Tamil Nadu"],
  ["Udaipur", "Rajasthan"],
  ["Ujjain", "Madhya Pradesh"],
  ["Vadodara", "Gujarat"],
  ["Varanasi", "Uttar Pradesh"],
  ["Vasai-Virar", "Maharashtra"],
  ["Vellore", "Tamil Nadu"],
  ["Vijayawada", "Andhra Pradesh"],
  ["Visakhapatnam", "Andhra Pradesh"],
  ["Warangal", "Telangana"],
];

/**
 * Autocomplete input specialized for Indian cities with fallback for unlisted locations.
 */
export function CityAutocomplete({
  label = "City",
  value,
  onChange,
  required = false,
  placeholder = "Start typing a city…",
}) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => setQuery(value || ""), [value]);

  useEffect(() => {
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const normalized = String(query || "")
    .toLowerCase()
    .trim();
  const filtered = CITIES.filter(([name, state]) =>
    `${name} ${state}`.toLowerCase().includes(normalized),
  ).slice(0, 14);

  return (
    <div className="mb-3 autocomplete-wrap" ref={ref}>
      <label className="form-label">
        {label}
        {required && <span className="text-danger ms-1">*</span>}
      </label>
      <div className="input-group">
        <span className="input-group-text bg-white">
          <i className="bi bi-geo-alt" />
        </span>
        <input
          className="form-control"
          value={query}
          required={required && !value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            onChange(v);
            setOpen(true);
          }}
        />
        {value && (
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => {
              setQuery("");
              onChange("");
              setOpen(false);
            }}
          >
            <i className="bi bi-x" />
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="autocomplete-menu shadow-sm">
          {filtered.map(([name, state]) => (
            <button
              type="button"
              className="autocomplete-option"
              key={`${name}-${state}`}
              onClick={() => {
                onChange(name);
                setQuery(name);
                setOpen(false);
              }}
            >
              <span>{name}</span>
              <small>{state}</small>
            </button>
          ))}
        </div>
      )}
      {open && normalized && !filtered.length && (
        <div className="autocomplete-menu shadow-sm">
          <div className="autocomplete-empty">
            No city in the local directory. You can continue with the typed
            city.
          </div>
        </div>
      )}
    </div>
  );
}
