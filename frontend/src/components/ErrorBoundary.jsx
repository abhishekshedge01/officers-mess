import React from "react";
import { Link } from "react-router-dom";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught application UI error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="om-error-screen">
          <div className="om-error-card text-center">
            <div className="om-error-badge-row">
              <span className="om-error-code-badge" style={{ backgroundColor: "#dc2626" }}>
                APPLICATION ERROR
              </span>
              <span className="om-error-type-tag">CLIENT EXCEPTION</span>
            </div>

            <div
              className="om-error-icon-box"
              style={{
                backgroundColor: "rgba(220, 38, 38, 0.12)",
                color: "#dc2626",
                borderColor: "rgba(220, 38, 38, 0.25)",
              }}
            >
              <i className="bi bi-exclamation-triangle"></i>
            </div>

            <h1 className="om-error-title">Something went wrong</h1>

            <p className="om-error-description">
              An unexpected display issue occurred in the interface. Your session data is intact and you can reload the Officers Mess portal safely.
            </p>

            <div className="om-error-actions">
              <button
                type="button"
                className="btn btn-primary px-4 py-2 fw-semibold"
                onClick={this.handleReset}
              >
                <i className="bi bi-arrow-clockwise me-2"></i>
                Reload Application
              </button>

              <button
                type="button"
                className="btn btn-outline-secondary px-4 py-2 fw-semibold"
                onClick={() => window.location.reload()}
              >
                <i className="bi bi-arrow-repeat me-2"></i>
                Refresh Page
              </button>
            </div>

            {this.state.error && (
              <div className="om-error-details-container mt-4 text-start">
                <div className="om-error-technical-box p-3 font-monospace small bg-light rounded border text-break">
                  <strong>Details:</strong> {this.state.error?.toString()}
                </div>
              </div>
            )}

            <div className="om-error-footer">
              Officers Mess Accommodation & Billing Management System
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
