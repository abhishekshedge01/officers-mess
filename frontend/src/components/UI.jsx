// components/UI.jsx
// Common UI presentation components: Card, Field, Select, Alert, Badge, Page, and Empty state.

import React, { useEffect, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { Autocomplete } from "./Autocomplete";
import { apiLoading } from "../services/api";
import tableLoader from "../loader.lottie";


export const TableLoading = ({ children, loading = false, className = "", minHeight = 220 }) => {
  return (
    <div className={`table-responsive position-relative ${className}`} style={{ minHeight: loading ? minHeight : undefined }}>
      {loading ? (
        <div
          className="d-flex flex-column align-items-center justify-content-center py-5 w-100"
          style={{ minHeight }}
          role="status"
          aria-live="polite"
        >
          <div style={{ width: 110, height: 110 }}>
            <DotLottieReact src={tableLoader || "/loader.lottie"} autoplay loop />
          </div>
          <span className="text-secondary small fw-semibold mt-2" style={{ letterSpacing: "0.3px" }}>
            Updating data…
          </span>
        </div>
      ) : (
        children
      )}
    </div>
  );
};

export const Card = ({ children, className = "" }) => (
  <div className={`card app-card ${className}`}>
    <div className="card-body">{children}</div>
  </div>
);

export const Field = ({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder = "",
  disabled = false,
  min,
  max,
}) => (
  <div className="mb-3">
    <label className="form-label">
      {label}
      {required && <span className="text-danger ms-1">*</span>}
    </label>
    <input
      className="form-control"
      type={type}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
    />
  </div>
);

export const Select = ({
  label,
  value,
  onChange,
  options,
  required = false,
}) => (
  <Autocomplete
    label={label}
    value={value}
    onChange={onChange}
    options={options}
    required={required}
  />
);

export { Autocomplete };

export const Alert = ({ children, type = "danger", dismissAfter = 3500, onDismiss }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!dismissAfter) return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, dismissAfter);
    return () => clearTimeout(timer);
  }, [children, dismissAfter]);

  if (!visible) return null;

  const iconMap = {
    danger: "exclamation-octagon-fill text-danger",
    success: "check-circle-fill text-success",
    warning: "exclamation-triangle-fill text-warning",
    info: "info-circle-fill text-primary",
  };

  const iconClass = iconMap[type] || "info-circle-fill text-secondary";

  return (
    <div
      className={`alert alert-${type} om-modern-alert d-flex align-items-center justify-content-between shadow-sm`}
      role="alert"
    >
      <div className="d-flex align-items-center gap-2">
        <i className={`bi bi-${iconClass} fs-5`} />
        <div>{children}</div>
      </div>
      <button
        type="button"
        className="btn-close ms-3"
        aria-label="Close"
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
      />
    </div>
  );
};

export const Badge = ({ children, type = "secondary", className = "" }) => {
  let badgeClass = `badge text-bg-${type}`;

  const lowerType = String(type).toLowerCase();
  if (
    lowerType === "checked-in" ||
    lowerType === "checked_in" ||
    lowerType === "primary"
  ) {
    badgeClass = "badge status-badge-checked-in";
  } else if (
    lowerType === "checkout-requested" ||
    lowerType === "checkout_requested"
  ) {
    badgeClass = "badge status-badge-checkout-requested";
  } else if (
    lowerType === "payment-complete" ||
    lowerType === "paid" ||
    lowerType === "payment_complete"
  ) {
    badgeClass = "badge status-badge-payment-complete";
  } else if (lowerType === "approved" || lowerType === "yellow") {
    badgeClass = "badge status-badge-approved";
  } else if (
    lowerType === "cancelled" ||
    lowerType === "user_cancelled" ||
    lowerType === "user-cancelled" ||
    lowerType === "red"
  ) {
    badgeClass = "badge status-badge-cancelled";
  } else if (lowerType === "rejected" || lowerType === "white") {
    badgeClass = "badge status-badge-rejected";
  } else if (
    lowerType === "payment-pending" ||
    lowerType === "payment_pending" ||
    lowerType === "green" ||
    lowerType === "grey" ||
    lowerType === "gray"
  ) {
    badgeClass = "badge status-badge-payment-pending";
  }

  return <span className={`${badgeClass} ${className}`}>{children}</span>;
};

export const Page = ({ title, subtitle, actions, children }) => (
  <>
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions}
    </div>
    {children}
  </>
);

export const Empty = ({ text }) => (
  <div className="empty">
    <i className="bi bi-inbox fs-2" />
    <span>{text}</span>
  </div>
);
