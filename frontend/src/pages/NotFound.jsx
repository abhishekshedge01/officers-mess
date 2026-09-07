import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../services/api";

export default function NotFound() {
  const nav = useNavigate();
  const location = useLocation();
  const isLoggedIn = !!auth.token;

  return (
    <div className="om-error-screen">
      <div className="om-error-card text-center">
        <div className="om-error-badge-row">
          <span className="om-error-code-badge">404</span>
          <span className="om-error-type-tag">INVALID URL / PAGE NOT FOUND</span>
        </div>

        <div className="om-error-icon-box om-error-icon-404">
          <i className="bi bi-compass"></i>
        </div>

        <h1 className="om-error-title">Page Does Not Exist</h1>

        {location.pathname && location.pathname !== "/" && (
          <div className="om-error-invalid-url-box mb-3">
            <span className="small text-muted me-1">Entered URL:</span>
            <code className="text-danger fw-semibold">{location.pathname}</code>
          </div>
        )}

        <p className="om-error-description">
          The URL address you entered does not exist or may have been misspelled. Please verify the link or return to your Officers Mess portal dashboard.
        </p>

        <div className="om-error-actions">
          <button
            type="button"
            className="btn btn-outline-secondary px-4 py-2"
            onClick={() => nav(-1)}
          >
            <i className="bi bi-arrow-left me-2"></i>
            Go Back
          </button>

          <Link
            to={isLoggedIn ? "/" : "/login"}
            className="btn btn-primary px-4 py-2 fw-semibold"
          >
            <i className="bi bi-house-door-fill me-2"></i>
            {isLoggedIn ? "Officers Mess Dashboard" : "Return to Login"}
          </Link>
        </div>

        <div className="om-error-footer">
          Officers Mess Accommodation & Billing Management System
        </div>
      </div>
    </div>
  );
}
