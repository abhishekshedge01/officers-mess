import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { api, auth } from "../services/api";
import { ROLES, roleName } from "../constants";

export default function AppLayout({ children }) {
  const nav = useNavigate();

  const [currentUser, setCurrentUser] = useState(auth.user);

  const u = currentUser;
  const [messName, setMessName] = useState("Officers Mess");
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  useEffect(() => {
    const handleUserUpdated = () => {
      setCurrentUser(auth.user);
    };

    window.addEventListener("auth-user-updated", handleUserUpdated);

    return () => {
      window.removeEventListener("auth-user-updated", handleUserUpdated);
    };
  }, []);

  useEffect(() => {
    const loadMess = async () => {
      if (!u || u.role === ROLES.USER) return;

      try {
        const response = await api.get("/dashboard");

        if (response.data?.mess?.name) {
          setMessName(response.data.mess.name);
        }
      } catch (error) {
        console.error("Unable to load mess name:", error);
      }
    };

    loadMess();
  }, [u?.role]);

  useEffect(() => {
    if (!u) return;

    const loadProfile = async () => {
      try {
        const response = await api.get("/users/profile");

        if (response.data?.user) {
          const latestUser = {
            ...u,
            ...response.data.user,
          };

          setCurrentUser(latestUser);

          auth.set(auth.token, latestUser);
        }
      } catch (error) {
        console.error("Unable to load profile:", error);
      }
    };

    loadProfile();
  }, []);

  useEffect(() => {
    if (!u) return;

    let mounted = true;

    const loadUnreadNotifications = async () => {
      try {
        const response = await api.get("/notifications/unread-count", {
          __omSilent: true,
        });

        if (mounted) {
          setUnreadNotifications(Number(response.data?.count || 0));
        }
      } catch (error) {
        console.error("Unable to load notification count:", error);
      }
    };

    // Load immediately
    loadUnreadNotifications();

    // Refresh every 5 seconds silently without triggering table or card loaders
    const timer = setInterval(loadUnreadNotifications, 5000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [u?.role]);

  // Operational counters for Mess Manager
  const [managerCounters, setManagerCounters] = useState({
    pendingRequests: 0,
    waitingCheckout: 0,
  });

  useEffect(() => {
    if (!u || u.role !== ROLES.MANAGER) return;

    let mounted = true;
    const loadManagerCounters = async () => {
      try {
        const response = await api.get("/dashboard");
        if (mounted && response.data?.statistics) {
          setManagerCounters({
            pendingRequests: Number(
              response.data.statistics.pendingApproval ||
                response.data.statistics.pendingManager ||
                0,
            ),
            waitingCheckout: Number(
              response.data.statistics.waitingCheckout ||
                response.data.statistics.checkoutRequestedBookings ||
                0,
            ),
          });
        }
      } catch (e) {
        // quiet fallback
      }
    };

    loadManagerCounters();
    const interval = setInterval(loadManagerCounters, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [u?.role]);

  // Operational counters for Officer / User (Pending Bills)
  const [userCounters, setUserCounters] = useState({
    pendingBills: 0,
  });

  useEffect(() => {
    if (!u || u.role !== ROLES.USER) return;

    let mounted = true;
    const loadUserCounters = async () => {
      try {
        const response = await api.get("/dashboard");
        if (mounted && response.data?.statistics) {
          setUserCounters({
            pendingBills: Number(response.data.statistics.pendingBills || 0),
          });
        }
      } catch (e) {
        // quiet fallback
      }
    };

    loadUserCounters();
    const interval = setInterval(loadUserCounters, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [u?.role]);

  let links = [["/", "Dashboard", "speedometer2"]];

  /* =========================
     OFFICER / USER
     ========================= */
  if (u?.role === ROLES.USER) {
    links.push(
      ["/book", "Request Stay", "calendar-plus"],
      ["/my-bookings", "My Stays", "journal-check"],
      ["/my-bills", "Bills & Payment", "receipt"],
    );
  }

  /* =========================
     ADMIN
     ========================= */
  if (u?.role === ROLES.ADMIN) {
    links.push(
      ["/admin", "Officers Messes", "building"],
      ["/admin/pmc", "PMC Management", "person-badge"],
      ["/admin/audit-logs", "Audit & API Logs", "shield-check"],
      ["/admin/backups", "Database & Backups", "hdd-stack"],
    );
  }

  /* =========================
     PMC
     ========================= */
  if (u?.role === ROLES.PMC) {
    links.push(
      ["/pmc", "PMC Operations", "diagram-3"],
      ["/pmc/revenue", "Revenue", "graph-up-arrow"],
      ["/pmc/rooms", "Room Management", "door-open"],
      ["/pmc/manager", "Update Mess Manager", "person-gear"],
      ["/pmc/secretary", "Update Mess Secretary", "person-gear"],
    );
  }

  /* =========================
     MESS MANAGER
     ========================= */
  if (u?.role === ROLES.MANAGER) {
    links.push(
      ["/manager", "Manager Operations", "house-check"],
      ["/manager/requests", "Booking Requests", "hourglass-split"],
      ["/manager/rooms", "Rooms Management", "door-open"],
      ["/manager/revenue", "Revenue", "graph-up-arrow"],
    );
  }

  /* =========================
     MESS SECRETARY
     ========================= */
  if (u?.role === ROLES.SECRETARY) {
    links.push(
      ["/secretary", "Secretary Operations", "check2-square"],
      ["/secretary/rooms", "Room Management", "door-open"],
      ["/secretary/revenue", "Revenue", "graph-up-arrow"],
    );
  }

  /* =========================
     COMMON LINKS
     ========================= */
  links.push(
    ["/profile", "Profile", "person"],
    ["/notifications", "Notifications", "bell"],
    ["/change-password", "Password", "key"],
  );

  return (
    <div className="app-shell">
      {/* ==================================================
          SIDEBAR
          ================================================== */}
      <aside className="sidebar">
        {/* SIDEBAR CONTENT */}
        <div className="sidebar-content">
          {/* =========================
        BRAND
        ========================= */}
          <div className="sidebar-brand">
            <div className="sidebar-logo-wrapper">
              <img
                src="/img.png"
                alt="Officers Mess"
                className="sidebar-logo"
              />
            </div>

            <div className="sidebar-mess-name">{messName}</div>

            <div className="sidebar-subtitle">Officers Mess Management</div>

            <div className="sidebar-divider">
              <span></span>
              <i className="bi bi-star-fill"></i>
              <span></span>
            </div>
          </div>

          {/* =========================
        PROFILE
        ========================= */}
          <div className="sidebar-profile">
            <div className="sidebar-profile-avatar">
              <i className="bi bi-person-fill"></i>
            </div>

            <div className="sidebar-profile-details">
              <strong>
                {u?.rank ? `${u.rank} ` : ""}
                {u?.name || "Officer"}
              </strong>

              <span>Portfolio: {roleName(u?.role)}</span>

              <small>Service No: {u?.serviceId || "N/A"}</small>
            </div>
          </div>

          {/* =========================
        NAVIGATION
        ========================= */}
          <nav className="sidebar-nav">
            {links
              .filter((link) => Array.isArray(link))
              .map(([to, label, icon]) => (
                <NavLink
                  key={to}
                  to={to}
                  end
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? "active" : ""}`
                  }
                >
                  <i className={`bi bi-${icon}`}></i>

                  <span className="sidebar-link-label">
                    {label}

                    {to === "/notifications" && unreadNotifications > 0 && (
                      <span className="notification-count-badge">
                        {unreadNotifications > 99 ? "99+" : unreadNotifications}
                      </span>
                    )}

                    {to === "/manager/requests" &&
                      managerCounters.pendingRequests > 0 && (
                        <span className="notification-count-badge bg-warning text-dark">
                          {managerCounters.pendingRequests > 99
                            ? "99+"
                            : managerCounters.pendingRequests}
                        </span>
                      )}

                    {to === "/manager" &&
                      managerCounters.waitingCheckout > 0 && (
                        <span className="notification-count-badge bg-danger text-white">
                          {managerCounters.waitingCheckout > 99
                            ? "99+"
                            : managerCounters.waitingCheckout}
                        </span>
                      )}

                    {to === "/my-bills" && userCounters.pendingBills > 0 && (
                      <span className="notification-count-badge bg-danger text-white">
                        {userCounters.pendingBills > 99
                          ? "99+"
                          : userCounters.pendingBills}
                      </span>
                    )}
                  </span>
                </NavLink>
              ))}
          </nav>

          {/* =========================
        LOGOUT
        ========================= */}
          <div className="sidebar-logout-wrapper">
            <button
              className="logout"
              onClick={async () => {
                try {
                  if (auth.token) {
                    await api.post("/auth/logout", {
                      refreshToken: auth.refreshToken,
                    });
                  }
                } catch (error) {
                  console.error("Logout request failed:", error);
                } finally {
                  auth.clear();
                  nav("/login", { replace: true });
                }
              }}
            >
              <i className="bi bi-box-arrow-right"></i>

              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ==================================================
          MAIN
          ================================================== */}
      <main className="main">
        {/* USER / OFFICER DOES NOT GET TOPBAR */}
        {u?.role !== ROLES.USER && (
          <header className="topbar">
            <div className="mess-brand">
              <div className="mess-logo">
                <i className="bi bi-shield-shaded"></i>
              </div>

              <strong>{messName}</strong>
            </div>

            <span className="top-role">{roleName(u?.role)}</span>
          </header>
        )}

        <div className="content">{children}</div>
      </main>
    </div>
  );
}
