import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, auth, errorMessage } from "../services/api";
import { Alert } from "../components/UI";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export function Login() {
  const nav = useNavigate();
  const [f, setF] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api.post("/auth/login", f);
      auth.set(r.data.accessToken || r.data.token, r.data.user, r.data.refreshToken);
      // Keep the branded loading animation visible for 4.5 seconds after login succeeds
      setTransitioning(true);
      await new Promise((resolve) => setTimeout(resolve, 4500));
      nav("/", { replace: true });
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className={`om-auth-stage ${transitioning ? "om-auth-stage-transitioning" : ""}`}>
      {/* Success transition overlay: background becomes transparent/dimmed and form disappears */}
      {transitioning ? (
        <div className="om-login-transition-screen" role="status" aria-live="polite">
          <div className="om-login-transition-box">
            <DotLottieReact src="/before_login.lottie" autoplay loop />
          </div>
          <div className="om-login-transition-title">Entering Officers Mess…</div>
        </div>
      ) : (
        /* Split Glassmorphic Card */
        <div className="om-split-card">
        {/* Left Side: Onloginside Lottie (Big Zoomed In) */}
        <div className="om-split-hero">
          <div className="align">
            <img src="/img.png" alt="Officers Mess Crest" className="om-hero-crest" />
            <span className="om-hero-badge-text">OFFICERS MESS PORTAL</span>
          </div>
          <div className="om-hero-lottie-container">
            <DotLottieReact src="/onloginside.lottie" autoplay loop />
          </div>

          <div className="om-hero-info">
            <div className="om-hero-motto">
              Together We Serve
            </div>
          </div>
        </div>

        {/* Right Side: Sign-in Form */}
        <div className="om-split-form-panel">
          <div className="om-form-top">
            <div className="om-form-heading">
              <h3>Sign In</h3>
            </div>
          </div>

          {err && <Alert>{err}</Alert>}

          <form onSubmit={submit} className="om-form-body">
            <div className="mb-3">
              <label className="form-label fw-semibold">
                Official Email <span className="text-danger">*</span>
              </label>
              <div className="input-group">
                <span className="input-group-text bg-white text-secondary">
                  <i className="bi bi-envelope" />
                </span>
                <input
                  type="email"
                  className="form-control"
                  placeholder="officer@email.com"
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                  required
                  disabled={busy || transitioning}
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label fw-semibold">
                Password <span className="text-danger">*</span>
              </label>
              <div className="input-group">
                <span className="input-group-text bg-white text-secondary">
                  <i className="bi bi-lock" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  className="form-control"
                  placeholder="Enter your password"
                  value={f.password}
                  onChange={(e) => setF({ ...f, password: e.target.value })}
                  required
                  disabled={busy || transitioning}
                />
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  <i className={`bi bi-eye${showPassword ? "-slash" : ""}`} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-100 om-btn-submit"
              disabled={busy || transitioning}
            >
              {busy ? (
                <span>
                  <span className="spinner-border spinner-border-sm me-2" role="status" />
                  Verifying Identity…
                </span>
              ) : (
                <span>
                  <i className="bi bi-shield-lock me-2" />
                  Sign In to Mess Portal
                </span>
              )}
            </button>
          </form>

          <div className="om-form-footer">
            <span className="text-secondary small">New officer or not registered? </span>
            <Link to="/register" className="fw-semibold text-decoration-none small text-primary ms-1">
              Create Account
            </Link>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

export function Register() {
  const nav = useNavigate();
  const [f, setF] = useState({
    name: "",
    rank: "",
    email: "",
    password: "",
    serviceId: "",
    mobile: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);

    try {
      const r = await api.post("/auth/register", f);
      setMsg(r.data.message || "Officer registered successfully.");
      await new Promise((resolve) => setTimeout(resolve, 4000));
      nav("/login");
    } catch (e) {
      setErr(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="om-auth-stage">
      {busy && (
        <div className="auth-overlay-loading" role="status" aria-live="polite">
          <div className="om-auth-lottie-box">
            <DotLottieReact src="/loading.lottie" autoplay loop />
          </div>
          <div className="fw-semibold text-dark mt-2">Creating your secure account…</div>
          <div className="small text-secondary mt-1">Please wait for the confirmation message.</div>
        </div>
      )}

      {/* Split Glassmorphic Card for Register as well */}
      <div className="om-split-card om-split-card-register">
        {/* Left Side: Onloginside Lottie */}
        <div className="om-split-hero">
            <img src="/img.png" alt="Officers Mess Crest" className="om-hero-crest" />
            <span className="om-hero-badge-text">OFFICERS MESS PORTAL</span>

          <div className="om-hero-lottie-container">
            <DotLottieReact src="/onloginside.lottie" autoplay loop />
          </div>

          <div className="om-hero-info">
            <div className="om-hero-motto">
              Together We Serve
            </div>
          </div>
        </div>

        {/* Right Side: Registration Form */}
        <div className="om-split-form-panel">
          <div className="om-form-top">
            <div className="om-form-heading">
              <h3>Create Account</h3>
            </div>
          </div>

          {err && <Alert>{err}</Alert>}
          {msg && <Alert type="success">{msg}</Alert>}

          <form onSubmit={submit} className="om-form-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Service Number <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-person-badge" />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g., 39343K or 12345-A"
                    value={f.serviceId}
                    onChange={(e) => setF({ ...f, serviceId: e.target.value })}
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Rank <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-award" />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g., Wing Commander / Sqn Ldr"
                    value={f.rank}
                    onChange={(e) => setF({ ...f, rank: e.target.value })}
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="col-12">
                <label className="form-label fw-semibold">
                  Full Name <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-person" />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Officer's full name"
                    value={f.name}
                    onChange={(e) => setF({ ...f, name: e.target.value })}
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Email <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-envelope" />
                  </span>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="officer@email.com"
                    value={f.email}
                    onChange={(e) => setF({ ...f, email: e.target.value })}
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="col-md-6">
                <label className="form-label fw-semibold">
                  Contact Mobile <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-telephone" />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="10-digit mobile"
                    value={f.mobile}
                    onChange={(e) => setF({ ...f, mobile: e.target.value })}
                    required
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="col-12">
                <label className="form-label fw-semibold">
                  Password <span className="text-danger">*</span>
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-white text-secondary">
                    <i className="bi bi-lock" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="form-control"
                    placeholder="Create secure password (min 6 characters)"
                    value={f.password}
                    onChange={(e) => setF({ ...f, password: e.target.value })}
                    required
                    disabled={busy}
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    <i className={`bi bi-eye${showPassword ? "-slash" : ""}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <button className="btn btn-primary w-100 om-btn-submit" disabled={busy}>
                {busy ? (
                  <span>
                    <span className="spinner-border spinner-border-sm me-2" role="status" />
                    Registering…
                  </span>
                ) : (
                  <span>
                    <i className="bi bi-check2-circle me-2" />
                    Complete Registration
                  </span>
                )}
              </button>
            </div>
          </form>

          <div className="om-form-footer">
            <span className="text-secondary small">Already have an account? </span>
            <Link to="/login" className="fw-semibold text-decoration-none small text-primary ms-1">
              Sign In Here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
