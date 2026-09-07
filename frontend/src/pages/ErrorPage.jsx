import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { auth, api } from "../services/api";

export default function ErrorPage() {
  const nav = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Determine error type and message from query param or location state
  const typeParam = searchParams.get("type") || location.state?.type || "network";
  const messageParam = searchParams.get("message") || location.state?.message || "";
  const codeParam = searchParams.get("code") || location.state?.code || "";

  const [retrying, setRetrying] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // Ping the server health/auth endpoint to test connectivity
      await api.get("/health", { timeout: 4000 }).catch(() => {
        // Fallback check to dashboard/login
        return api.get("/auth/verify", { timeout: 4000 });
      });
      setRetrySuccess(true);
      setTimeout(() => {
        if (location.state?.from) {
          nav(location.state.from, { replace: true });
        } else if (auth.token) {
          nav("/", { replace: true });
        } else {
          nav("/login", { replace: true });
        }
      }, 800);
    } catch {
      setRetrySuccess(false);
      // Brief feedback so user sees attempt happened
      setTimeout(() => setRetrying(false), 600);
    }
  };

  const isLoggedIn = !!auth.token;

  // Configurations for different types of errors
  let title = "Network Connection Issue";
  let description =
    "Unable to connect to the Officers Mess service. Your device may be offline, or the backend application server is momentarily restarting or unreachable.";
  let badgeCode = codeParam || "OFFLINE / NETWORK";
  let tag = "COMMUNICATION FAILURE";
  let iconClass = "bi-wifi-off";
  let accentColor = "#d97706"; // Amber / warning

  if (typeParam === "500" || typeParam === "server") {
    title = "Internal Server Error";
    description =
      "The server encountered an unexpected error while processing your request. The technical team has logged this occurrence for investigation.";
    badgeCode = codeParam || "500";
    tag = "SERVER ERROR";
    iconClass = "bi-server";
    accentColor = "#dc2626"; // Danger
  } else if (typeParam === "403" || typeParam === "forbidden") {
    title = "Access Restricted";
    description =
      "You do not possess the required military appointment privileges or role authorizations to view this mess register or operation.";
    badgeCode = codeParam || "403";
    tag = "ACCESS DENIED";
    iconClass = "bi-shield-slash";
    accentColor = "#7c3aed"; // Purple
  } else if (typeParam === "timeout") {
    title = "Request Timed Out";
    description =
      "The Officers Mess portal waited for a response from the server, but the connection timed out before completion. Please retry.";
    badgeCode = codeParam || "TIMEOUT";
    tag = "GATEWAY TIMEOUT";
    iconClass = "bi-hourglass-bottom";
    accentColor = "#ea580c"; // Orange
  }

  if (messageParam) {
    description = messageParam;
  }

  return (
    <div className="om-error-screen">
      <div className="om-error-card text-center">
        {/* Status Badges */}
        <div className="om-error-badge-row">
          <span className="om-error-code-badge" style={{ backgroundColor: accentColor }}>
            {badgeCode}
          </span>
          <span className="om-error-type-tag">{tag}</span>
        </div>

        {/* Big Icon */}
        <div
          className="om-error-icon-box"
          style={{
            backgroundColor: `${accentColor}18`,
            color: accentColor,
            borderColor: `${accentColor}35`,
          }}
        >
          <i className={`bi ${iconClass}`}></i>
        </div>

        {/* Title & Humanized Description */}
        <h1 className="om-error-title">{title}</h1>

        <p className="om-error-description">{description}</p>

        {/* Connection diagnostics when in network mode */}
        {typeParam === "network" && (
          <div className="om-error-diagnostics">
            <div className="d-flex align-items-center justify-content-center gap-2 mb-2">
              <span
                className="om-error-indicator-dot"
                style={{ backgroundColor: isOnline ? "#16a34a" : "#dc2626" }}
              />
              <span className="small fw-semibold text-secondary">
                Browser status: {isOnline ? "Online (Local network connected)" : "Offline (No internet access)"}
              </span>
            </div>
            <div className="small text-muted">
              Tip: If you are running locally, verify your backend node server on port 8000 is running.
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="om-error-actions">
          <button
            type="button"
            className="btn btn-primary px-4 py-2 fw-semibold d-inline-flex align-items-center justify-content-center gap-2"
            onClick={handleRetry}
            disabled={retrying || retrySuccess}
          >
            {retrying ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                Checking Connection…
              </>
            ) : retrySuccess ? (
              <>
                <i className="bi bi-check-circle-fill text-white" />
                Connected! Redirecting…
              </>
            ) : (
              <>
                <i className="bi bi-arrow-clockwise" />
                Retry Connection
              </>
            )}
          </button>

          <Link
            to={isLoggedIn ? "/" : "/login"}
            className="btn btn-outline-secondary px-4 py-2 fw-semibold"
          >
            <i className="bi bi-house-door me-2"></i>
            {isLoggedIn ? "Officers Mess Dashboard" : "Return to Login"}
          </Link>
        </div>

        {/* Expandable Technical Details */}
        {(codeParam || messageParam || location.state?.error) && (
          <div className="om-error-details-container mt-4 text-start">
            <button
              type="button"
              className="btn btn-link btn-sm text-decoration-none text-muted p-0 d-flex align-items-center gap-1 mx-auto"
              onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            >
              <span>{showTechnicalDetails ? "Hide technical diagnostic" : "Show technical diagnostic"}</span>
              <i className={`bi bi-chevron-${showTechnicalDetails ? "up" : "down"}`}></i>
            </button>

            {showTechnicalDetails && (
              <div className="om-error-technical-box mt-2 p-3 font-monospace small bg-light rounded border text-break">
                {codeParam && (
                  <div>
                    <strong>Error Code:</strong> {codeParam}
                  </div>
                )}
                {messageParam && (
                  <div className="mt-1">
                    <strong>Message:</strong> {messageParam}
                  </div>
                )}
                {location.state?.error && (
                  <div className="mt-1">
                    <strong>Stack / Detail:</strong> {String(location.state.error)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="om-error-footer">
          Officers Mess Accommodation & Billing Management System
        </div>
      </div>
    </div>
  );
}
