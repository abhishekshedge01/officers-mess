import React, { useEffect, useRef, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import Protected from "./components/Protected";
import AppLayout from "./layouts/AppLayout";

import { Login, Register } from "./pages/Auth";

import Dashboard from "./pages/Dashboard";
import BookStay from "./pages/BookStay";

import MyBookings, { BookingDetail } from "./pages/Bookings";

import Bills from "./pages/Bills";
import Admin from "./pages/Admin";
import AdminPMC from "./pages/AdminPMC";
import AuditLogs from "./pages/AuditLogs";
import AdminBackup from "./pages/AdminBackup";
import Rooms from "./pages/Rooms";

import { Manager, Staff, StaffManagement } from "./pages/Operations";

import Profile from "./pages/Profile";
import Password from "./pages/Password";
import Notifications from "./pages/Notifications";
import Requests from "./pages/Requests";
import Revenue from "./pages/Revenue";
import NotFound from "./pages/NotFound";
import ErrorPage from "./pages/ErrorPage";
import ErrorBoundary from "./components/ErrorBoundary";

import { ROLES } from "./constants";
import { apiLoading } from "./services/api";

function LottieOverlay({ text = "Loading Officers Mess…", variant = "page" }) {
  return (
    <div className={`om-lottie-overlay om-lottie-overlay-${variant}`} role="status" aria-live="polite">
      <div className="om-lottie-box">
        <DotLottieReact src="/loading.lottie" autoplay loop />
      </div>
      <div className="om-lottie-title">{text}</div>
    </div>
  );
}

function GlobalRequestLoader() {
  const [state, setState] = useState({ active: 0, gets: 0, mutations: 0 });
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = apiLoading.subscribe(setState);
    return unsubscribe;
  }, []);

  useEffect(() => {
    document.body.classList.toggle("om-api-get-loading", state.gets > 0);
    document.body.classList.toggle("om-api-mutation-loading", state.mutations > 0);
    return () => {
      document.body.classList.remove("om-api-get-loading", "om-api-mutation-loading");
    };
  }, [state.gets, state.mutations]);

  const location = useLocation();
  const hasMountedRoute = useRef(false);

  // loading.lottie is ONLY a page-transition loader.
  // Do not show/restart it on the first render of a page.
  // Table/data requests are handled separately by TableLoading + loader.lottie.
  useEffect(() => {
    if (!hasMountedRoute.current) {
      hasMountedRoute.current = true;
      return;
    }

    if (["/login", "/register"].includes(location.pathname)) return;

    setPageLoading(true);
    const timer = window.setTimeout(() => setPageLoading(false), 1200);
    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  return (
    <>
      {pageLoading && <LottieOverlay text="Opening page…" variant="page" />}
      {state.mutations > 0 && <div className="om-loading-progress" aria-hidden="true"><span /></div>}
    </>
  );
}
const Guard = ({ roles, children }) => (
  <Protected roles={roles}>
    <AppLayout>{children}</AppLayout>
  </Protected>
);

export default function App() {
  return (
    <ErrorBoundary>
      <GlobalRequestLoader />
      <Routes>
      {/* ==================================================
                AUTH
                ================================================== */}

      <Route path="/login" element={<Login />} />

      <Route path="/register" element={<Register />} />

      {/* ==================================================
                COMMON DASHBOARD
                ================================================== */}

      <Route
        path="/"
        element={
          <Guard>
            <Dashboard />
          </Guard>
        }
      />

      <Route
        path="/profile"
        element={
          <Guard>
            <Profile />
          </Guard>
        }
      />

      <Route
        path="/notifications"
        element={
          <Guard>
            <Notifications />
          </Guard>
        }
      />

      <Route
        path="/change-password"
        element={
          <Guard>
            <Password />
          </Guard>
        }
      />

      {/* ==================================================
                OFFICER / USER
                ================================================== */}

      <Route
        path="/book"
        element={
          <Guard roles={[ROLES.USER]}>
            <BookStay />
          </Guard>
        }
      />

      <Route
        path="/my-bookings"
        element={
          <Guard roles={[ROLES.USER]}>
            <MyBookings />
          </Guard>
        }
      />

      <Route
        path="/my-bills"
        element={
          <Guard roles={[ROLES.USER]}>
            <Bills />
          </Guard>
        }
      />

      <Route
        path="/booking/:bookingId"
        element={
          <Guard>
            <BookingDetail />
          </Guard>
        }
      />

      {/* ==================================================
                ADMIN
                ================================================== */}

      <Route
        path="/admin"
        element={
          <Guard roles={[ROLES.ADMIN]}>
            <Admin />
          </Guard>
        }
      />

      <Route
        path="/admin/pmc"
        element={
          <Guard roles={[ROLES.ADMIN]}>
            <AdminPMC />
          </Guard>
        }
      />

      <Route
        path="/admin/audit-logs"
        element={
          <Guard roles={[ROLES.ADMIN]}>
            <AuditLogs />
          </Guard>
        }
      />

      <Route
        path="/admin/backups"
        element={
          <Guard roles={[ROLES.ADMIN]}>
            <AdminBackup />
          </Guard>
        }
      />

      {/* ==================================================
                MESS MANAGER
                ================================================== */}

      <Route
        path="/manager"
        element={
          <Guard roles={[ROLES.MANAGER]}>
            <Manager />
          </Guard>
        }
      />

      {/* MANAGER - FULL ROOM MANAGEMENT */}

      <Route
        path="/manager/rooms"
        element={
          <Guard roles={[ROLES.MANAGER]}>
            <Rooms />
          </Guard>
        }
      />

      <Route
        path="/manager/requests"
        element={
          <Guard roles={[ROLES.MANAGER]}>
            <Requests role={ROLES.MANAGER} />
          </Guard>
        }
      />

      <Route
        path="/manager/revenue"
        element={
          <Guard roles={[ROLES.MANAGER]}>
            <Revenue />
          </Guard>
        }
      />

      {/* ==================================================
                MESS SECRETARY
                ================================================== */}

      <Route
        path="/secretary"
        element={
          <Guard roles={[ROLES.SECRETARY]}>
            <Staff role="SECRETARY" />
          </Guard>
        }
      />

      {/* SECRETARY - VIEW ONLY ROOMS */}

      <Route
        path="/secretary/rooms"
        element={
          <Guard roles={[ROLES.SECRETARY]}>
            <Rooms readOnly />
          </Guard>
        }
      />

      <Route
        path="/secretary/revenue"
        element={
          <Guard roles={[ROLES.SECRETARY]}>
            <Revenue />
          </Guard>
        }
      />

      {/* ==================================================
                PMC
                ================================================== */}

      <Route
        path="/pmc"
        element={
          <Guard roles={[ROLES.PMC]}>
            <Staff role="PMC" />
          </Guard>
        }
      />

      {/* PMC - VIEW ONLY ROOMS */}

      <Route
        path="/pmc/rooms"
        element={
          <Guard roles={[ROLES.PMC]}>
            <Rooms readOnly />
          </Guard>
        }
      />

      <Route
        path="/pmc/revenue"
        element={
          <Guard roles={[ROLES.PMC]}>
            <Revenue />
          </Guard>
        }
      />

      {/* ==================================================
                PMC STAFF MANAGEMENT
                ================================================== */}

      <Route
        path="/pmc/manager"
        element={
          <Guard roles={[ROLES.PMC]}>
            <StaffManagement type="manager" />
          </Guard>
        }
      />

      <Route
        path="/pmc/secretary"
        element={
          <Guard roles={[ROLES.PMC]}>
            <StaffManagement type="secretary" />
          </Guard>
        }
      />

      {/* ==================================================
                ERROR & STATUS PAGES
                ================================================== */}

      <Route path="/404" element={<NotFound />} />
      <Route path="/error" element={<ErrorPage />} />

      {/* ==================================================
                FALLBACK / NOT FOUND
                ================================================== */}

      <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}
